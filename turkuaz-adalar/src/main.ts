import './style.css'
import { Capacitor } from '@capacitor/core'
import { Game } from './core/Game.ts'
import { createEl } from './utils/dom.ts'
import { toError } from './utils/errors.ts'

const container = document.querySelector<HTMLDivElement>('#app')

if (!container) {
  throw new Error('The #app mount point is missing from index.html.')
}

const mount = container
let game: Game | null = null

function renderFatalFallback(error: Error): void {
  if (mount.querySelector('.screen--error')) {
    return
  }

  mount.replaceChildren()
  const screen = createEl('div', 'screen screen--error')
  const panel = createEl('div', 'panel error-panel')
  panel.append(
    createEl('p', 'eyebrow', 'Something broke the current'),
    createEl('h2', 'screen-title', 'The tide pulled us under'),
    createEl('p', 'screen-copy', error.message),
  )

  const reload = createEl('button', 'btn btn--primary', 'Reload the game')
  reload.type = 'button'
  reload.addEventListener('click', () => window.location.reload())
  panel.appendChild(reload)

  screen.appendChild(panel)
  mount.appendChild(screen)
}

/**
 * The native launch screen (emblem on the deep sea) stays up until the game's
 * own loading screen, which matches it, has been painted: no blank frame in
 * between. Also called on a fatal error so the error screen is visible.
 */
function hideLaunchScreen(): void {
  if (!Capacitor.isNativePlatform()) {
    return
  }
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      void import('@capacitor/splash-screen')
        .then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 250 }))
        .catch(() => undefined)
    }),
  )
}

async function bootstrap(): Promise<void> {
  game = new Game(mount)
  // The constructor puts the loading screen up; init() then loads for seconds.
  hideLaunchScreen()
  await game.init()
  if (import.meta.env.DEV) {
    // Dev-only handle used by automated smoke tests and manual debugging.
    // Stripped from production builds.
    ;(window as Window & { __turkuaz?: Game }).__turkuaz = game
  }
}

void bootstrap().catch((error: unknown) => {
  const resolved = toError(error)
  console.error('[Tidelark] Bootstrap failed.', resolved)
  renderFatalFallback(resolved)
  hideLaunchScreen()
})

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game?.dispose()
    game = null
  })
}
