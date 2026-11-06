/** Meteorological seasons (northern hemisphere, like Türkiye). */
export type Season = 'winter' | 'spring' | 'summer' | 'autumn'

const SEASON_BY_MONTH: readonly Season[] = [
  'winter', // Jan
  'winter',
  'spring',
  'spring',
  'spring',
  'summer',
  'summer',
  'summer',
  'autumn',
  'autumn',
  'autumn',
  'winter', // Dec
]

export function seasonOf(date: Date): Season {
  return SEASON_BY_MONTH[date.getMonth()]
}

/** Whole days left in the current season, including today. */
export function daysLeftInSeason(date: Date): number {
  const season = seasonOf(date)
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  let days = 0
  while (seasonOf(day) === season && days < 120) {
    days += 1
    day.setDate(day.getDate() + 1)
  }
  return days
}

/**
 * A seasonal item can be bought only during its season; once owned it is
 * kept forever. Items without a season are always on sale.
 */
export function isOnSale(item: { readonly season?: Season }, date: Date): boolean {
  return item.season === undefined || item.season === seasonOf(date)
}
