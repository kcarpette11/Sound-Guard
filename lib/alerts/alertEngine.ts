import { mapLabelToCategory, CATEGORY_META, type SoundGaurdCategory } from "@/lib/ml/labels";
import type { ClassificationResult } from "@/lib/ml/classifier";

export interface Detection {
  id: string;
  category: SoundGaurdCategory;
  label: string;
  confidence: number;
  timestamp: number;
}

export interface DominantSound {
  category: SoundGaurdCategory;
  score: number;
}

const CATEGORIES = Object.keys(CATEGORY_META) as SoundGaurdCategory[];

/** Weight of each new observation in the per-category moving average. */
const SMOOTHING = 0.7;
/**
 * A single observation this far above a category's gate is unambiguous enough
 * to alert on immediately, without waiting for the average to catch up. This
 * is what keeps a loud clear alarm from costing several extra windows.
 */
const IMMEDIATE_FACTOR = 1.3;
/**
 * How much louder the dominant sound must be than a candidate before the
 * candidate is treated as background noise and suppressed.
 */
const DOMINANCE_MARGIN = 1.25;
/** A sustained non-knock sound at or above this level blocks the knock fast path. */
const SUSTAINED_ACTIVE_SCORE = 0.15;
/** Minimum measured onset strength before a transient is worth investigating. */
const TRANSIENT_MIN_STRENGTH = 0.5;
/**
 * How strongly the classifier must agree a triggered clip is knocking. Kept
 * low deliberately: a single knock occupies a small slice of the clip the
 * model pads out, so even an unmistakable knock scores modestly. The
 * rival-category check below is what actually rejects coughs, taps and beats.
 */
const TRANSIENT_CONFIRM_SCORE = 0.05;
/** Minimum gap between transient investigations, to bound inference cost. */
const TRANSIENT_PROBE_INTERVAL_MS = 500;
/** Below this, a category is treated as absent rather than "quietly present". */
const PRESENCE_FLOOR = 0.05;

let detectionCounter = 0;

function emptyScores(): Record<SoundGaurdCategory, number> {
  return CATEGORIES.reduce(
    (acc, category) => {
      acc[category] = 0;
      return acc;
    },
    {} as Record<SoundGaurdCategory, number>
  );
}

export class AlertEngine {
  private smoothed = emptyScores();
  private observed = emptyScores();
  private lastLabel: Partial<Record<SoundGaurdCategory, string>> = {};
  private lastFiredAt: Partial<Record<SoundGaurdCategory, number>> = {};
  private lastTransientProbeAt = 0;

  /**
   * Folds one classification window into the running per-category scores and
   * returns a detection if one should fire.
   *
   * Categories are scored and compared as a set rather than walked in rank
   * order, so the loudest thing in the room wins. A weak background label
   * (AudioSet often surfaces "Tap"/"Thump" underneath a crying baby) can no
   * longer fire just because the true dominant sound is mid-cooldown.
   */
  observeWindow(predictions: ClassificationResult[]): Detection | null {
    const observed = emptyScores();

    for (const prediction of predictions) {
      const category = mapLabelToCategory(prediction.label);
      if (!category) continue;
      // Keep the strongest label per category; AudioSet emits several
      // related labels ("Crying, sobbing", "Baby cry, infant cry") at once.
      if (prediction.score > observed[category]) {
        observed[category] = prediction.score;
        this.lastLabel[category] = prediction.label;
      }
    }

    for (const category of CATEGORIES) {
      this.smoothed[category] =
        this.smoothed[category] * (1 - SMOOTHING) + observed[category] * SMOOTHING;
    }
    this.observed = observed;

    return this.selectDetection(Date.now());
  }

  /** Cheap pre-check so an onset can be discarded before paying for inference. */
  shouldInvestigateTransient(strength: number): boolean {
    if (strength < TRANSIENT_MIN_STRENGTH) return false;
    if (this.isSustainedSoundActive()) return false;

    const now = Date.now();
    if (now - this.lastTransientProbeAt < TRANSIENT_PROBE_INTERVAL_MS) return false;
    if (now - (this.lastFiredAt.door_knock ?? 0) < CATEGORY_META.door_knock.cooldownMs) {
      return false;
    }

    this.lastTransientProbeAt = now;
    return true;
  }

  /**
   * Fast path for percussive onsets. The onset detector only supplies timing —
   * every impulse (a cup set down, a cough, a click) has a knock's shape — so
   * the classifier must corroborate that the clip actually sounds like
   * knocking before an alert fires.
   */
  observeTransient(strength: number, predictions: ClassificationResult[]): Detection | null {
    // Deliberately does not re-run the probe-interval gate: the caller already
    // passed it to get here, and consuming it twice would reject every clip.
    if (strength < TRANSIENT_MIN_STRENGTH) return null;
    if (this.isSustainedSoundActive()) return null;
    if (Date.now() - (this.lastFiredAt.door_knock ?? 0) < CATEGORY_META.door_knock.cooldownMs) {
      return null;
    }

    let knockScore = 0;
    let knockLabel = "";
    let rivalScore = 0;
    for (const prediction of predictions) {
      const category = mapLabelToCategory(prediction.label);
      if (category === "door_knock") {
        if (prediction.score > knockScore) {
          knockScore = prediction.score;
          knockLabel = prediction.label;
        }
      } else if (category && prediction.score > rivalScore) {
        rivalScore = prediction.score;
      }
    }

    if (knockScore < TRANSIENT_CONFIRM_SCORE) return null;
    // Something else in the clip explains the impulse better than knocking.
    if (rivalScore > knockScore) return null;

    // Report the classifier's confidence, tempered by how clean the onset was.
    const confidence = knockScore * (0.6 + 0.4 * strength);
    return this.emit("door_knock", knockLabel, confidence, Date.now());
  }

  /** The category currently being heard most strongly, for live UI feedback. */
  getDominant(): DominantSound | null {
    const category = this.argmax();
    if (!category || this.activation(category) < PRESENCE_FLOOR) return null;
    return { category, score: this.activation(category) };
  }

  /** True while a continuous (non-knock) sound is holding the foreground. */
  private isSustainedSoundActive(): boolean {
    return CATEGORIES.some(
      (category) => category !== "door_knock" && this.smoothed[category] >= SUSTAINED_ACTIVE_SCORE
    );
  }

  /**
   * Score used for alerting. Normally the smoothed average, which resists
   * single noisy frames -- but a strong enough one-off observation is trusted
   * on the spot, so an obvious alarm does not wait for the average to rise.
   */
  private activation(category: SoundGaurdCategory): number {
    const observed = this.observed[category];
    if (observed >= CATEGORY_META[category].threshold * IMMEDIATE_FACTOR) {
      return Math.max(this.smoothed[category], observed);
    }
    return this.smoothed[category];
  }

  private argmax(): SoundGaurdCategory | null {
    let best: SoundGaurdCategory | null = null;
    for (const category of CATEGORIES) {
      if (!best || this.activation(category) > this.activation(best)) best = category;
    }
    return best && this.activation(best) > 0 ? best : null;
  }

  private selectDetection(now: number): Detection | null {
    const eligible = CATEGORIES.filter((category) => {
      const meta = CATEGORY_META[category];
      if (this.activation(category) < meta.threshold) return false;
      return now - (this.lastFiredAt[category] ?? 0) >= meta.cooldownMs;
    });
    if (eligible.length === 0) return null;

    let best = eligible[0];
    for (const category of eligible) {
      if (this.activation(category) > this.activation(best)) best = category;
    }

    // If something else is clearly louder, this candidate is background
    // noise riding underneath the real sound — stay quiet rather than
    // announcing the wrong thing.
    const dominant = this.argmax();
    if (
      dominant &&
      dominant !== best &&
      this.activation(dominant) > this.activation(best) * DOMINANCE_MARGIN
    ) {
      return null;
    }

    return this.emit(best, this.lastLabel[best] ?? best, this.activation(best), now);
  }

  private emit(
    category: SoundGaurdCategory,
    label: string,
    confidence: number,
    now: number
  ): Detection {
    this.lastFiredAt[category] = now;
    detectionCounter += 1;
    return {
      id: `${now}-${detectionCounter}`,
      category,
      label,
      confidence: Math.min(1, confidence),
      timestamp: now,
    };
  }
}
