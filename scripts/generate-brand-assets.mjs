/**
 * Renders the app icon and splash sources into `assets/` from vector art, so
 * they stay crisp at every size. Then `npx capacitor-assets generate` turns
 * them into every Android/iOS density.
 *
 *   npm run assets:brand
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'assets')
mkdirSync(out, { recursive: true })

const COLORS = {
  deepTop: '#0b657e',
  deepBottom: '#041a20',
  turquoise: '#61f5e3',
  turquoiseStrong: '#2fe0cd',
  mint: '#b6ffe9',
  shade: '#0e8f86',
  shadeDeep: '#0a5f63',
  sand: '#f1d29a',
}

/** Faceted crystal centred at (cx, cy), `size` = total height. */
function crystal(cx, cy, size) {
  const h = size / 2
  const w = size * 0.36
  const mid = cy - size * 0.08
  const top = cy - h
  const bottom = cy + h
  return `
    <g>
      <polygon points="${cx},${top} ${cx + w},${mid} ${cx},${mid + size * 0.04}" fill="${COLORS.turquoiseStrong}"/>
      <polygon points="${cx},${top} ${cx - w},${mid} ${cx},${mid + size * 0.04}" fill="${COLORS.mint}"/>
      <polygon points="${cx - w},${mid} ${cx},${mid + size * 0.04} ${cx},${bottom}" fill="${COLORS.turquoise}"/>
      <polygon points="${cx + w},${mid} ${cx},${mid + size * 0.04} ${cx},${bottom}" fill="${COLORS.shade}"/>
      <polygon points="${cx},${top} ${cx - w * 0.38},${mid - size * 0.02} ${cx},${mid - size * 0.12}" fill="#ffffff" opacity="0.55"/>
    </g>`
}

/** Two stylised swells under the crystal. */
function waves(cx, cy, width, stroke) {
  const half = width / 2
  const wave = (y, opacity) =>
    `<path d="M ${cx - half} ${y} q ${width / 8} ${-stroke * 1.6} ${width / 4} 0 t ${width / 4} 0 t ${width / 4} 0 t ${width / 4} 0"
      fill="none" stroke="${COLORS.turquoise}" stroke-width="${stroke}" stroke-linecap="round" opacity="${opacity}"/>`
  return wave(cy, 0.95) + wave(cy + stroke * 2.4, 0.5)
}

function background(size) {
  return `
    <defs>
      <radialGradient id="bg" cx="50%" cy="30%" r="80%">
        <stop offset="0" stop-color="${COLORS.deepTop}"/>
        <stop offset="1" stop-color="${COLORS.deepBottom}"/>
      </radialGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="${COLORS.turquoise}" stop-opacity="0.45"/>
        <stop offset="1" stop-color="${COLORS.turquoise}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#bg)"/>`
}

/** Full icon (iOS, legacy Android, store listing). */
function iconSvg(size, { withBackground = true } = {}) {
  const c = size / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${withBackground ? background(size) : `<defs><radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${COLORS.turquoise}" stop-opacity="0.45"/><stop offset="1" stop-color="${COLORS.turquoise}" stop-opacity="0"/></radialGradient></defs>`}
    <circle cx="${c}" cy="${c - size * 0.06}" r="${size * 0.3}" fill="url(#glow)"/>
    ${crystal(c, c - size * 0.07, size * 0.5)}
    ${waves(c, c + size * 0.26, size * 0.5, size * 0.032)}
  </svg>`
}

/**
 * Android adaptive foreground. capacitor-assets already insets this layer by
 * 16.7% per side (the 66% safe zone), so the art fills most of its canvas.
 */
function foregroundSvg(size) {
  const c = size / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${crystal(c, c - size * 0.08, size * 0.62)}
    ${waves(c, c + size * 0.32, size * 0.62, size * 0.04)}
  </svg>`
}

function backgroundSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${background(size)}</svg>`
}

/** Splash: the mark plus the title, centred on the deep-sea gradient. */
function splashSvg(size) {
  const c = size / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${background(size)}
    <circle cx="${c}" cy="${c - size * 0.06}" r="${size * 0.12}" fill="url(#glow)"/>
    ${crystal(c, c - size * 0.07, size * 0.17)}
    <text x="${c}" y="${c + size * 0.1}" text-anchor="middle" font-family="Avenir Next, Helvetica, Arial, sans-serif"
      font-weight="800" font-size="${size * 0.05}" letter-spacing="${size * 0.004}" fill="${COLORS.mint}">TURKUAZ</text>
    <text x="${c}" y="${c + size * 0.155}" text-anchor="middle" font-family="Avenir Next, Helvetica, Arial, sans-serif"
      font-weight="800" font-size="${size * 0.05}" letter-spacing="${size * 0.004}" fill="${COLORS.sand}">ADALAR</text>
  </svg>`
}

/** Play Store feature graphic, 1024x500. */
function featureSvg() {
  const w = 1024
  const h = 500
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="fbg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${COLORS.deepTop}"/>
        <stop offset="1" stop-color="${COLORS.deepBottom}"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="${COLORS.turquoise}" stop-opacity="0.45"/>
        <stop offset="1" stop-color="${COLORS.turquoise}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#fbg)"/>
    <circle cx="250" cy="230" r="190" fill="url(#glow)"/>
    ${crystal(250, 220, 260)}
    ${waves(250, 400, 300, 16)}
    <text x="470" y="225" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-weight="800" font-size="92" fill="${COLORS.mint}">Turkuaz</text>
    <text x="470" y="320" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-weight="800" font-size="92" fill="${COLORS.sand}">Adalar</text>
  </svg>`
}

async function render(name, svg, size) {
  const file = join(out, name)
  await sharp(Buffer.from(svg)).resize(size.width, size.height).png().toFile(file)
  console.log(`✓ ${name}`)
}

await render('icon-only.png', iconSvg(1024), { width: 1024, height: 1024 })
await render('icon-foreground.png', foregroundSvg(1024), { width: 1024, height: 1024 })
await render('icon-background.png', backgroundSvg(1024), { width: 1024, height: 1024 })
await render('splash.png', splashSvg(2732), { width: 2732, height: 2732 })
await render('splash-dark.png', splashSvg(2732), { width: 2732, height: 2732 })

mkdirSync(join(root, 'store'), { recursive: true })
await sharp(Buffer.from(iconSvg(512)))
  .png()
  .toFile(join(root, 'store', 'icon-512.png'))
await sharp(Buffer.from(featureSvg()))
  .png()
  .toFile(join(root, 'store', 'feature-graphic-1024x500.png'))
console.log('✓ store/icon-512.png, store/feature-graphic-1024x500.png')

writeFileSync(
  join(out, 'README.md'),
  'Generated by `npm run assets:brand` (scripts/generate-brand-assets.mjs). Edit the script, not these PNGs.\n',
)
