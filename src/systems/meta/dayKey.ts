/** Local calendar day as `YYYY-MM-DD`. Daily systems roll over at local midnight. */
export function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function previousDayKey(date: Date): string {
  return dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1))
}

/** Whole hours until the next local midnight (at least 1). */
export function hoursUntilMidnight(date: Date): number {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  return Math.max(1, Math.ceil((midnight.getTime() - date.getTime()) / 3_600_000))
}

/** Small deterministic hash so every player gets the same missions on a given day. */
export function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export type Clock = () => Date
export const systemClock: Clock = () => new Date()
