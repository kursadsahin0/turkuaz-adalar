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
  mint: '#b6ffe9',
  sand: '#f1d29a',
}

/**
 * The Tidelark emblem, drawn on a 1024×1024 grid: a turquoise wave breaking
 * under a sunset, with a lark gliding over the crest. `bleed` extends the
 * sky and sea past the grid for Android's adaptive background layer.
 */
function emblemDefs() {
  return `
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe2a8"/>
      <stop offset="0.42" stop-color="#ffab7e"/>
      <stop offset="0.62" stop-color="#ff8a6e"/>
    </linearGradient>
    <linearGradient id="wave" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#5ff2df"/>
      <stop offset="0.55" stop-color="#16b8b0"/>
      <stop offset="1" stop-color="#086b73"/>
    </linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1f9ea0"/>
      <stop offset="1" stop-color="#0b4f5a"/>
    </linearGradient>
    <linearGradient id="barrel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d5f68"/>
      <stop offset="1" stop-color="#063840"/>
    </linearGradient>`
}

function emblemScene(bleed = 0) {
  const left = -40 - bleed
  const right = 1064 + bleed
  const bottom = 1064 + bleed
  return `
    <rect x="${-bleed}" y="${-bleed}" width="${1024 + bleed * 2}" height="${1024 + bleed * 2}" fill="url(#sky)"/>
    <circle cx="700" cy="290" r="150" fill="#fff4d6"/>
    <path d="M ${left} 760 L -40 760 C 200 700 420 660 620 640 C 800 624 940 650 1064 690 L ${right} 690
             L ${right} ${bottom} L ${left} ${bottom} Z" fill="url(#sea)"/>
    <path d="M ${left} ${bottom} L ${left} 640 L -40 640
             C 120 560 260 420 470 380
             C 680 340 840 440 860 600
             C 870 690 800 760 720 750
             C 640 740 612 660 660 620
             C 690 596 730 610 740 640
             C 760 560 690 500 610 510
             C 500 524 450 640 490 760
             C 520 850 640 900 1064 880 L ${right} 880
             L ${right} ${bottom} Z" fill="url(#wave)"/>
    <path d="M 740 640 C 760 560 690 500 610 510 C 500 524 450 640 490 760
             C 470 650 530 560 620 552 C 680 548 724 590 740 640 Z" fill="url(#barrel)"/>
    <path d="M 120 580 C 250 470 360 400 470 380 C 680 340 840 440 860 600
             C 864 646 852 690 830 718
             C 834 600 764 476 612 446 C 460 418 300 468 120 580 Z" fill="#effffb"/>`
}

/** The lark, a swallow-like glider seen from above, heading up and right. */
function lark() {
  return `
    <g transform="translate(330 270) rotate(-24) scale(0.88)">
      <path d="M 92 0 C 74 -11 52 -15 30 -14 C 8 -42 -36 -112 -128 -156
               C -74 -104 -44 -52 -24 -18 L -78 -30 L -50 0 L -78 30 L -24 18
               C -44 52 -74 104 -128 156 C -36 112 8 42 30 14 C 52 15 74 11 92 0 Z"
            fill="#0a3442"/>
    </g>`
}

/** The emblem as a group, optionally clipped to a rounded square (splash, store, web). */
function emblem({ rounded = false, id = 'e' } = {}) {
  return `
    <defs>${emblemDefs()}${rounded ? `<clipPath id="${id}"><rect width="1024" height="1024" rx="230"/></clipPath>` : ''}</defs>
    <g ${rounded ? `clip-path="url(#${id})"` : ''}>${emblemScene()}${lark()}</g>`
}

/** Full square icon (iOS, legacy Android, store listing); the OS rounds it. */
function iconSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${emblem()}</svg>`
}

/**
 * Android adaptive icon. The generated ic_launcher.xml insets both layers by
 * 16.7%, so both use the same 1024 grid: the scene behind, the lark in
 * front (launchers that animate the layers give it a little depth).
 */
function foregroundSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${lark()}</svg>`
}

function backgroundSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
    <defs>${emblemDefs()}</defs>${emblemScene()}</svg>`
}

/** Splash: the rounded emblem and the wordmark on the deep-sea background. */
function splashSvg(size) {
  const c = size / 2
  const mark = size * 0.2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <radialGradient id="bg" cx="50%" cy="40%" r="75%">
        <stop offset="0" stop-color="${COLORS.deepTop}"/>
        <stop offset="1" stop-color="${COLORS.deepBottom}"/>
      </radialGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#bg)"/>
    <svg x="${c - mark / 2}" y="${c - mark * 0.72}" width="${mark}" height="${mark}" viewBox="0 0 1024 1024">${emblem({ rounded: true, id: 'splash' })}</svg>
    <text x="${c}" y="${c + mark * 0.62}" text-anchor="middle" font-family="Avenir Next, Helvetica, Arial, sans-serif"
      font-weight="800" font-size="${size * 0.05}" letter-spacing="${size * 0.004}"><tspan fill="${COLORS.mint}">TIDE</tspan><tspan fill="${COLORS.sand}">LARK</tspan></text>
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
    </defs>
    <rect width="${w}" height="${h}" fill="url(#fbg)"/>
    <svg x="96" y="100" width="300" height="300" viewBox="0 0 1024 1024">${emblem({ rounded: true, id: 'feature' })}</svg>
    <text x="456" y="250" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-weight="800" font-size="104"><tspan fill="${COLORS.mint}">Tide</tspan><tspan fill="${COLORS.sand}">lark</tspan></text>
    <text x="460" y="312" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-weight="600" font-size="34" letter-spacing="3" fill="${COLORS.mint}" fill-opacity="0.75">ISLAND RUNNER</text>
  </svg>`
}

/** Browser tab icon: the rounded emblem as a standalone SVG. */
function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${emblem({ rounded: true, id: 'fav' })}</svg>\n`
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

writeFileSync(join(root, 'public', 'favicon.svg'), faviconSvg())
console.log('✓ public/favicon.svg')

writeFileSync(
  join(out, 'README.md'),
  'Generated by `npm run assets:brand` (scripts/generate-brand-assets.mjs). Edit the script, not these PNGs.\n',
)
