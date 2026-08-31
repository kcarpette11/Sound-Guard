export type SoundGaurdCategory =
  | "smoke_alarm"
  | "door_knock"
  | "baby_cry"
  | "car_horn"
  | "siren";

export type Severity = "normal" | "medium" | "high" | "critical";

export interface CategoryMeta {
  title: string;
  emoji: string;
  severity: Severity;
  /** Tailwind background classes for the full-screen alert. */
  gradient: string;
  /** Tailwind text/border accent classes used in smaller UI (history rows, meter). */
  accent: string;
  /** Tailwind background-tint class for icon badges (history rows). */
  chipBg: string;
  /** CSS animation class applied to the alert emoji. */
  iconAnimation: string;
  /** Minimum confidence (0-1) required before this category fires an alert. */
  threshold: number;
  /** Minimum time (ms) between repeat alerts for this category. */
  cooldownMs: number;
}

export const CATEGORY_META: Record<SoundGaurdCategory, CategoryMeta> = {
  smoke_alarm: {
    title: "Fire / Smoke Alarm",
    emoji: "🚨",
    severity: "critical",
    gradient: "bg-gradient-to-br from-red-600 to-red-800",
    accent: "text-red-600 dark:text-red-400 border-red-500/40",
    chipBg: "bg-red-500/10",
    iconAnimation: "animate-hs-pulse-ring",
    threshold: 0.35,
    cooldownMs: 8000,
  },
  door_knock: {
    title: "Someone Is at the Door",
    emoji: "🚪",
    severity: "normal",
    gradient: "bg-gradient-to-br from-sky-600 to-blue-800",
    accent: "text-sky-600 dark:text-sky-400 border-sky-500/40",
    chipBg: "bg-sky-500/10",
    iconAnimation: "animate-hs-knock",
    // The instant transient detector (lib/audio/transientDetector.ts) is the
    // fast, sensitive path for real knocks. This neural-classifier threshold
    // stays conservative on purpose, so ambient noise mislabeled as
    // "Tap"/"Thump"/"Bang" doesn't also trigger false alerts through this path.
    threshold: 0.5,
    cooldownMs: 4000,
  },
  baby_cry: {
    title: "Baby Crying",
    emoji: "👶",
    severity: "medium",
    gradient: "bg-gradient-to-br from-amber-500 to-orange-600",
    accent: "text-amber-600 dark:text-amber-400 border-amber-500/40",
    chipBg: "bg-amber-500/10",
    iconAnimation: "animate-hs-sway",
    threshold: 0.25,
    cooldownMs: 6000,
  },
  car_horn: {
    title: "Car Horn Nearby",
    emoji: "🚗",
    severity: "medium",
    gradient: "bg-gradient-to-br from-amber-500 to-orange-600",
    accent: "text-amber-600 dark:text-amber-400 border-amber-500/40",
    chipBg: "bg-amber-500/10",
    iconAnimation: "animate-hs-shake",
    threshold: 0.4,
    cooldownMs: 6000,
  },
  siren: {
    title: "Emergency Vehicle Nearby",
    emoji: "🚑",
    severity: "high",
    gradient: "bg-gradient-to-br from-orange-600 to-red-700",
    accent: "text-orange-600 dark:text-orange-400 border-orange-500/40",
    chipBg: "bg-orange-500/10",
    iconAnimation: "animate-hs-pulse-ring",
    // Sirens are acoustically distinctive and matter urgently, so this no
    // longer sits at the strictest gate of the five.
    threshold: 0.4,
    cooldownMs: 8000,
  },
};

interface LabelRule {
  match: RegExp;
  /** Labels that match `match` but also this are not this category. */
  exclude?: RegExp;
  category: SoundGaurdCategory;
}

const KEYWORD_RULES: LabelRule[] = [
  { match: /smoke detector|smoke alarm|fire alarm/i, category: "smoke_alarm" },
  {
    match: /\bknock(ing)?\b|\btap(ping)?\b|\bthump\b|\bthud\b|\bbang\b|\brap\b/i,
    // AudioSet's "Water tap, faucet", "Tap dance" and "Rapping" all trip the
    // percussive patterns above without being anything like someone at a door.
    exclude: /water|faucet|sink|dance|rapping|music|drum|typing|keyboard/i,
    category: "door_knock",
  },
  { match: /baby cry|infant cry|crying,\s*sobbing|\bwhimper\b/i, category: "baby_cry" },
  { match: /vehicle horn|car horn|honking/i, category: "car_horn" },
  {
    match:
      /\bsiren\b|civil defense siren|ambulance|police car|fire engine|fire truck|emergency vehicle/i,
    category: "siren",
  },
];

export function mapLabelToCategory(label: string): SoundGaurdCategory | null {
  for (const rule of KEYWORD_RULES) {
    if (!rule.match.test(label)) continue;
    if (rule.exclude?.test(label)) continue;
    return rule.category;
  }
  return null;
}
