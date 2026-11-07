import { formatNumber } from '../i18n/i18n.ts'

/** Locale-aware integer (1,234 in English, 1.234 in Turkish). */
export function formatInteger(value: number): string {
  return formatNumber(Math.max(0, Math.floor(value)))
}

export function formatDistance(value: number): string {
  return `${formatInteger(value)} m`
}

export function formatSeconds(value: number): string {
  return `${Math.max(0, value).toFixed(1)}s`
}
