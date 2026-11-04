const integerFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function formatInteger(value: number): string {
  return integerFormatter.format(Math.max(0, Math.floor(value)))
}

export function formatDistance(value: number): string {
  return `${formatInteger(value)} m`
}

export function formatSeconds(value: number): string {
  return `${Math.max(0, value).toFixed(1)}s`
}
