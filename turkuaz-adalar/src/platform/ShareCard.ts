import { Capacitor } from '@capacitor/core'
import { formatDistance, formatInteger } from '../ui/format.ts'
import { t } from '../i18n/i18n.ts'
import { Logger } from '../utils/logger.ts'

export interface ShareCardData {
  readonly score: number
  readonly distance: number
  /** Island name, or null for the endless run. */
  readonly island: string | null
  readonly stars: number
  readonly isBest: boolean
}

const WIDTH = 1080
const HEIGHT = 1350
const FONT = "'Avenir Next', 'Segoe UI', system-ui, -apple-system, sans-serif"

/**
 * Draws the "beat my score" image: a turquoise sea, a floating island, the
 * score and a challenge line. Plain 2D canvas, so it needs no WebGL capture.
 */
export function drawShareCard(data: ShareCardData): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const g = canvas.getContext('2d')
  if (!g) {
    return canvas
  }

  const sky = g.createLinearGradient(0, 0, 0, HEIGHT)
  sky.addColorStop(0, '#0a4d5c')
  sky.addColorStop(0.55, '#0d7f86')
  sky.addColorStop(1, '#062c36')
  g.fillStyle = sky
  g.fillRect(0, 0, WIDTH, HEIGHT)

  // Sun glow and a floating island.
  const glow = g.createRadialGradient(780, 300, 10, 780, 300, 420)
  glow.addColorStop(0, 'rgba(255, 224, 138, 0.55)')
  glow.addColorStop(1, 'rgba(255, 224, 138, 0)')
  g.fillStyle = glow
  g.fillRect(0, 0, WIDTH, HEIGHT)
  g.fillStyle = '#3fbf7f'
  g.beginPath()
  g.ellipse(780, 360, 170, 40, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#8a5a3c'
  g.beginPath()
  g.moveTo(610, 362)
  g.lineTo(950, 362)
  g.lineTo(800, 520)
  g.closePath()
  g.fill()
  g.fillStyle = '#2f9f6a'
  g.beginPath()
  g.moveTo(740, 330)
  g.lineTo(780, 220)
  g.lineTo(820, 330)
  g.closePath()
  g.fill()

  // Waves.
  g.strokeStyle = 'rgba(182, 255, 233, 0.35)'
  g.lineWidth = 6
  for (let row = 0; row < 5; row += 1) {
    const y = 980 + row * 70
    g.beginPath()
    for (let x = -40; x <= WIDTH + 40; x += 20) {
      const wave = Math.sin((x + row * 60) / 70) * 14
      if (x === -40) {
        g.moveTo(x, y + wave)
      } else {
        g.lineTo(x, y + wave)
      }
    }
    g.stroke()
  }

  g.textAlign = 'center'
  g.fillStyle = '#ffe2a8'
  g.font = `800 64px ${FONT}`
  g.fillText('TIDELARK', WIDTH / 2, 150)

  g.fillStyle = 'rgba(233, 255, 250, 0.82)'
  g.font = `700 44px ${FONT}`
  g.fillText(data.island ?? t('share.endless'), WIDTH / 2, 600)
  if (data.stars > 0) {
    g.fillStyle = '#ffd666'
    g.font = `400 64px ${FONT}`
    g.fillText('★'.repeat(data.stars) + '☆'.repeat(Math.max(0, 3 - data.stars)), WIDTH / 2, 680)
  }

  g.fillStyle = '#ffffff'
  g.font = `800 190px ${FONT}`
  g.fillText(formatInteger(Math.floor(data.score)), WIDTH / 2, 860)
  g.fillStyle = 'rgba(233, 255, 250, 0.82)'
  g.font = `700 48px ${FONT}`
  g.fillText(
    `${formatDistance(data.distance)}${data.isBest ? ` · ${t('share.newBest')}` : ''}`,
    WIDTH / 2,
    940,
  )

  g.fillStyle = 'rgba(4, 26, 32, 0.55)'
  roundRect(g, 120, 1150, WIDTH - 240, 120, 60)
  g.fill()
  g.fillStyle = '#b6ffe9'
  g.font = `800 50px ${FONT}`
  g.fillText(t('share.challenge'), WIDTH / 2, 1228)
  return canvas
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  g.beginPath()
  g.moveTo(x + radius, y)
  g.arcTo(x + width, y, x + width, y + height, radius)
  g.arcTo(x + width, y + height, x, y + height, radius)
  g.arcTo(x, y + height, x, y, radius)
  g.arcTo(x, y, x + width, y, radius)
  g.closePath()
}

const logger = new Logger('Share')

export type ShareResult =
  | { readonly kind: 'shared' | 'cancelled' | 'failed' }
  /** No share sheet here (most desktop browsers): show the card instead. */
  | { readonly kind: 'preview'; readonly image: string; readonly text: string }

/**
 * Opens the system share sheet with the card image and a challenge text.
 * Native: the image is written to the cache folder and shared as a file.
 * Web: the Web Share API with a file when supported; otherwise the card is
 * handed back as a preview the caller shows with download/copy buttons.
 */
export async function shareScore(data: ShareCardData): Promise<ShareResult> {
  const canvas = drawShareCard(data)
  const text = t('share.text', { score: formatInteger(Math.floor(data.score)) })
  try {
    if (Capacitor.isNativePlatform()) {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ])
      const base64 = canvas.toDataURL('image/png').split(',')[1] ?? ''
      const file = await Filesystem.writeFile({
        path: 'turkuaz-score.png',
        data: base64,
        directory: Directory.Cache,
      })
      await Share.share({ title: 'Tidelark', text, files: [file.uri] })
      return { kind: 'shared' }
    }
    if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      const file = blob ? new File([blob], 'turkuaz-score.png', { type: 'image/png' }) : null
      if (file && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: 'Tidelark', text, files: [file] })
        return { kind: 'shared' }
      }
    }
    return { kind: 'preview', image: canvas.toDataURL('image/png'), text }
  } catch (error) {
    // Closing the share sheet rejects with an "AbortError"/"canceled".
    const message = error instanceof Error ? `${error.name} ${error.message}` : String(error)
    if (/abort|cancel/i.test(message)) {
      return { kind: 'cancelled' }
    }
    logger.warn('Sharing failed.', error)
    return { kind: 'failed' }
  }
}

/** Saves the card image as a file download (browsers). */
export function downloadShareImage(image: string): void {
  const link = document.createElement('a')
  link.href = image
  link.download = 'turkuaz-score.png'
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/** Copies the challenge text; false when the clipboard is unavailable. */
export async function copyShareText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // The async clipboard can be blocked (permissions, unfocused frames):
    // fall back to a selected textarea and the legacy copy command.
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      area.remove()
    }
  }
}
