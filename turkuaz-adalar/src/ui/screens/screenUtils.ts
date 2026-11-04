import { createEl, createIcon } from '../../utils/dom.ts'

export const ICON_PATHS = {
  pause: ['M9 5v14', 'M15 5v14'] as const,
  sound: ['M5 9v6h4l5 4V5L9 9H5z', 'M17 8.5a5 5 0 0 1 0 7'] as const,
  muted: ['M5 9v6h4l5 4V5L9 9H5z', 'M17 9l4 6', 'M21 9l-4 6'] as const,
  back: ['M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z'] as const,
} as const

export function playGlyph(): SVGSVGElement {
  return createIcon(['M8 5.5v13l10-6.5z'], { filled: true })
}

export function crystalGlyph(): SVGSVGElement {
  return createIcon(['M12 3l6 6-6 12-6-12 6-6z', 'M6 9h12'], { size: 14 })
}

export function createScreenRoot(className: string): HTMLDivElement {
  const root = createEl('div', `screen ${className}`)
  root.hidden = true
  root.setAttribute('aria-hidden', 'true')
  return root
}

export function createPanel(className = ''): HTMLDivElement {
  return createEl('div', `panel ${className}`.trim())
}

export { createEl }
