import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

/**
 * @dimforge/rapier3d-compat inlines its WASM as a base64 string (4.3 MB of
 * JavaScript). The same package also ships the identical binary, so the build
 * swaps the string for a URL to that file: 3.1 MB instead of 4.3 MB (gzip
 * 1.2 MB instead of 1.7 MB), no huge string to parse, and the browser can
 * compile it while it downloads. Dev keeps the inlined copy.
 */
function rapierExternalWasm(): Plugin {
  const RAPIER_MODULE = /@dimforge[\\/]rapier3d-compat[\\/]dist[\\/]rapier\.mjs$/
  // `<base64>.toByteArray("AGFzbQ…").buffer`: the whole expression becomes the URL.
  const INLINED_WASM = /\b[A-Za-z_$][\w$]*\.toByteArray\("AGFzbQ[A-Za-z0-9+/=]+"\)(?:\.buffer)?/
  return {
    name: 'turkuaz:rapier-external-wasm',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]
      if (!RAPIER_MODULE.test(file)) {
        return null
      }
      if (!INLINED_WASM.test(code)) {
        this.warn('Rapier no longer inlines its WASM as expected; keeping the bundled copy.')
        return null
      }
      const wasm = join(dirname(file), 'rapier_wasm3d_bg.wasm')
      return {
        code: `import __rapierWasmUrl from ${JSON.stringify(`${wasm}?url`)};\n${code.replace(INLINED_WASM, '__rapierWasmUrl')}`,
        map: null,
      }
    },
  }
}

/** The origin of a URL, or null when it is missing or malformed. */
function originOf(url: string | undefined): string | null {
  try {
    return url ? new URL(url).origin : null
  } catch {
    return null
  }
}

/**
 * Adds a Content-Security-Policy to the built index.html: code and assets
 * only from the app itself, network calls only to the analytics and crash
 * report hosts. The dev server is left alone (it needs its HMR socket).
 *
 * script-src keeps 'unsafe-inline' because Capacitor injects its bridge as an
 * inline <script> on Android WebViews older than DOCUMENT_START_SCRIPT
 * support; scripts from any other host are still blocked.
 * 'wasm-unsafe-eval' lets Rapier compile its WASM.
 */
function contentSecurityPolicy(): Plugin {
  let env: Record<string, string> = {}
  return {
    name: 'turkuaz:csp',
    apply: 'build',
    configResolved(config) {
      env = config.env
    },
    transformIndexHtml() {
      const connect = new Set([
        "'self'",
        'data:',
        'blob:',
        'https://eu.i.posthog.com',
        'https://*.ingest.sentry.io',
        'https://*.ingest.de.sentry.io',
        'https://*.ingest.us.sentry.io',
      ])
      const analytics = originOf(env.VITE_ANALYTICS_HOST)
      if (analytics) {
        connect.add(analytics)
      }
      const sentry = originOf(env.VITE_SENTRY_DSN)
      if (sentry) {
        connect.add(sentry)
      }
      const policy = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' data: blob:",
        "font-src 'self' data:",
        `connect-src ${[...connect].join(' ')}`,
        "worker-src 'self' blob:",
        "frame-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
      ].join('; ')
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

export default defineConfig({
  plugins: [rapierExternalWasm(), contentSecurityPolicy()],
  // Relative asset URLs so the same build works on the web and inside the
  // Capacitor WebViews (https://localhost on Android, capacitor:// on iOS).
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    target: 'es2022',
    // Three.js is the largest chunk (~700 KB); Rapier's WASM is a separate
    // asset (see rapierExternalWasm), not a JavaScript chunk.
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Three.js changes far less often than game code, so it gets its
            // own long-lived cached chunk.
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
          ],
        },
      },
    },
  },
})
