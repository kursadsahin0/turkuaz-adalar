import { CONTENT_DE, DE } from './strings.de.ts'
import { CONTENT_ES, ES } from './strings.es.ts'
import { CONTENT_TR, EN, TR, type StringKey } from './strings.ts'

export type Language = 'en' | 'tr' | 'de' | 'es'
export type { StringKey }

export const LANGUAGES: readonly { id: Language; label: string }[] = [
  { id: 'tr', label: 'Türkçe' },
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
  { id: 'es', label: 'Español' },
]

const UI: Readonly<Record<Language, Readonly<Record<StringKey, string>>>> = {
  en: EN,
  tr: TR,
  de: DE,
  es: ES,
}
/** Authored content per language; English is the content itself. */
const CONTENT: Readonly<Record<Exclude<Language, 'en'>, Readonly<Record<string, string>>>> = {
  tr: CONTENT_TR,
  de: CONTENT_DE,
  es: CONTENT_ES,
}
const LOCALES: Readonly<Record<Language, string>> = {
  en: 'en-US',
  tr: 'tr-TR',
  de: 'de-DE',
  es: 'es-ES',
}

let current: Language = 'en'
let integerFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** The device's first supported language (Turkish, German, Spanish), else English. */
export function detectLanguage(): Language {
  const languages =
    typeof navigator !== 'undefined'
      ? [...(navigator.languages ?? []), navigator.language].filter(Boolean)
      : []
  for (const language of languages) {
    const code = language.toLowerCase().slice(0, 2)
    if (isLanguage(code)) {
      return code
    }
  }
  return 'en'
}

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'tr' || value === 'de' || value === 'es'
}

/** BCP 47 locale for number and date formatting. */
export function localeOf(language: Language = current): string {
  return LOCALES[language]
}

export function getLanguage(): Language {
  return current
}

export function setLanguage(language: Language): void {
  current = language
  integerFormatter = new Intl.NumberFormat(LOCALES[language], {
    maximumFractionDigits: 0,
  })
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language
  }
}

/**
 * Translates a UI string. `{name}` placeholders are replaced from `vars`.
 * Every key exists in every language; the compiler enforces that.
 */
export function t(key: StringKey, vars?: Readonly<Record<string, string | number>>): string {
  const template = UI[current][key]
  return vars ? interpolate(template, vars) : template
}

/**
 * Translates authored content (level, cosmetic and power-up names) by id.
 * English is the authored text itself, so it is passed in as the fallback.
 */
export function tc(key: string, fallback: string): string {
  if (current === 'en') {
    return fallback
  }
  return CONTENT[current][key] ?? fallback
}

export function formatNumber(value: number): string {
  return integerFormatter.format(value)
}

function interpolate(template: string, vars: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}
