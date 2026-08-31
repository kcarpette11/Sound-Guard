/**
 * Detects short, sharp acoustic transients (like a knock) directly from
 * buffer-level RMS, independent of the neural classifier. Onset detection
 * catches a percussive hit far faster than waiting for an ambiguous AudioSet
 * label to win a classification window.
 *
 * The defining shape is quiet -> sharp attack -> decay. Requiring the run-up
 * to be quiet is what separates a real knock from peaks inside a continuous
 * loud sound such as a crying baby, speech, or a siren.
 *
 * Decay is measured against the peak rather than against silence: a knock on
 * a real door rings for a few hundred milliseconds, so demanding an immediate
 * return to the noise floor would reject almost every genuine knock.
 */
const PREROLL_BUFFERS = 3;
/** Give up on an attack that never decays — that is a sustained sound. */
const MAX_ATTACK_BUFFERS = 14;

interface Attack {
  peak: number;
  trigger: number;
  age: number;
}

export class TransientDetector {
  private noiseFloor: number;
  private attack: Attack | null = null;
  private recent: number[] = [];

  constructor(
    private readonly spikeRatio = 3,
    private readonly minRms = 0.015,
    /** Fraction of the peak the level must fall to for the hit to count. */
    private readonly decayFraction = 0.4,
    private readonly floorAlpha = 0.05,
    private readonly prerollQuietRatio = 3,
    initialNoiseFloor = 0.005
  ) {
    this.noiseFloor = initialNoiseFloor;
  }

  /**
   * Feed the RMS of one audio buffer. Returns a 0-1 confidence when a
   * transient completes (how far the peak rose above the ambient floor
   * relative to the trigger threshold), or null if no transient fired.
   */
  process(rms: number): number | null {
    if (this.attack) {
      this.attack.age += 1;
      if (rms > this.attack.peak) this.attack.peak = rms;

      const { peak, trigger, age } = this.attack;
      // Either a clean fall away from the peak, or all the way back to room tone.
      const decayed = rms < peak * this.decayFraction || rms < this.noiseFloor * 2;

      if (decayed) {
        this.attack = null;
        this.pushRecent(rms);
        // 1x over the trigger -> ~0.5, 3x or more -> ~1.0.
        return Math.max(0, Math.min(1, peak / (trigger * 2)));
      }

      if (age >= MAX_ATTACK_BUFFERS) {
        // Never came down: sustained sound, not a hit.
        this.attack = null;
        this.adaptFloor(rms);
      }

      this.pushRecent(rms);
      return null;
    }

    const trigger = Math.max(this.noiseFloor * this.spikeRatio, this.minRms);
    if (rms > trigger && this.wasQuietBefore()) {
      this.attack = { peak: rms, trigger, age: 0 };
    } else if (rms <= trigger) {
      this.adaptFloor(rms);
    }

    this.pushRecent(rms);
    return null;
  }

  /**
   * True when the run-up to this buffer sat near the ambient floor. Inside a
   * continuous loud sound the recent history is loud, so its internal peaks
   * are correctly rejected instead of being reported as knocks.
   */
  private wasQuietBefore(): boolean {
    if (this.recent.length < PREROLL_BUFFERS) return false;
    const ceiling = Math.max(this.noiseFloor * this.prerollQuietRatio, this.minRms * 0.8);
    return this.recent.every((value) => value < ceiling);
  }

  private pushRecent(rms: number): void {
    this.recent.push(rms);
    if (this.recent.length > PREROLL_BUFFERS) this.recent.shift();
  }

  private adaptFloor(rms: number): void {
    this.noiseFloor = this.noiseFloor * (1 - this.floorAlpha) + rms * this.floorAlpha;
  }
}
