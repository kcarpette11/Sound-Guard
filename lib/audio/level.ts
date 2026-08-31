const MIN_DB = -60;
const MAX_DB = -6;

/** Converts a linear RMS value into a perceptual 0-1 meter fraction (dB-scaled). */
export function levelToFraction(rms: number): number {
  const db = 20 * Math.log10(rms + 1e-8);
  const clamped = Math.max(MIN_DB, Math.min(MAX_DB, db));
  return (clamped - MIN_DB) / (MAX_DB - MIN_DB);
}
