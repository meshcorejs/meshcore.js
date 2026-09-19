const UNITS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** @param duration Milliseconds, or a string like 30s, 5m, 1h, 1d */
export function parseDuration(duration: string | number): number {
  if (typeof duration === 'number') {
    if (!(duration >= 0)) throw new RangeError(`invalid duration ${duration}`);
    return duration;
  }
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/.exec(duration.trim());
  if (!match) throw new RangeError(`invalid duration "${duration}", use e.g. "30s", "5m", "1d"`);
  return Number(match[1]) * (UNITS[match[2] as string] as number);
}
