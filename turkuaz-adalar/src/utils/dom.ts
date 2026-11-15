type TagName = keyof HTMLElementTagNameMap

export function createEl<Tag extends TagName>(
  tag: Tag,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag)
  if (className) {
    element.className = className
  }
  if (text !== undefined) {
    element.textContent = text
  }
  return element
}

export interface IconOptions {
  filled?: boolean
  size?: number
}

/**
 * Creates a compact inline SVG icon. Icons inherit `currentColor`, so they can
 * be styled purely with CSS.
 */
export function createIcon(paths: readonly string[], options: IconOptions = {}): SVGSVGElement {
  const namespace = 'http://www.w3.org/2000/svg'
  const icon = document.createElementNS(namespace, 'svg')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('aria-hidden', 'true')
  icon.setAttribute('focusable', 'false')
  icon.setAttribute('fill', options.filled ? 'currentColor' : 'none')
  icon.setAttribute('stroke', options.filled ? 'none' : 'currentColor')
  icon.setAttribute('stroke-width', '1.8')
  icon.setAttribute('stroke-linecap', 'round')
  icon.setAttribute('stroke-linejoin', 'round')
  if (options.size) {
    icon.setAttribute('width', String(options.size))
    icon.setAttribute('height', String(options.size))
  }

  for (const pathData of paths) {
    const path = document.createElementNS(namespace, 'path')
    path.setAttribute('d', pathData)
    icon.appendChild(path)
  }

  return icon
}
