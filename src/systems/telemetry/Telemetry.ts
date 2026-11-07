import type { SaveManager } from '../save/SaveManager.ts'
import { Logger } from '../../utils/logger.ts'
import { AnalyticsUploader } from './AnalyticsUploader.ts'

/** A short trail of what happened before a crash. */
export interface Breadcrumb {
  readonly at: number
  readonly category: string
  readonly message: string
}

export interface CrashRecord {
  readonly at: number
  readonly message: string
  readonly stack: string
  readonly source: 'error' | 'unhandledrejection' | 'caught'
  readonly context: string
  readonly version: string
  readonly breadcrumbs: readonly Breadcrumb[]
}

export type AnalyticsValue = string | number | boolean
export type AnalyticsProps = Readonly<Record<string, AnalyticsValue>>

export interface AnalyticsEvent {
  readonly name: string
  readonly at: number
  readonly props: AnalyticsProps
}

/**
 * Destination for analytics events. Nothing leaves the device by default;
 * a real service (Firebase, PostHog, ...) is a new sink registered here, and
 * must only be enabled after the player opts in.
 */
export interface AnalyticsSink {
  send(event: AnalyticsEvent): void
}

/** Optional remote crash service; created only when a DSN is configured. */
interface RemoteCrashSink {
  capture(error: Error, record: CrashRecord): void
}

const CRASH_LOG_KEY = 'crashlog'
const MAX_CRASHES = 10
const MAX_BREADCRUMBS = 30
const MAX_EVENTS = 200
const MAX_STACK = 4000

export interface TelemetryOptions {
  readonly version: string
  /** Sentry DSN from VITE_SENTRY_DSN; empty disables remote reporting. */
  readonly sentryDsn?: string
  /** Player setting: may crash reports and anonymous usage data leave the device? */
  readonly crashReportsAllowed: boolean
  readonly environment: string
  /**
   * Optional usage analytics (VITE_ANALYTICS_KEY / VITE_ANALYTICS_HOST): a
   * PostHog-compatible project. Without a key no event leaves the device.
   */
  readonly analytics?: {
    readonly host: string
    readonly apiKey: string
    readonly platform: string
  }
}

/**
 * Crash reporting and analytics in one place.
 *
 * - Every uncaught error and unhandled promise rejection is recorded locally
 *   (last ten, with the breadcrumbs before it), so a player can describe a
 *   bug and the log is still there.
 * - If a Sentry DSN is configured *and* the player allows crash reports, the
 *   Sentry SDK is loaded on demand and errors are also sent, without personal
 *   data.
 * - Analytics events go through `track()` into an in-memory buffer and any
 *   registered sinks; with an analytics key configured and the same player
 *   setting on, they are also uploaded anonymously (see AnalyticsUploader).
 */
export class Telemetry {
  private readonly logger = new Logger('Telemetry')
  private readonly save: SaveManager
  private readonly options: TelemetryOptions
  private readonly breadcrumbs: Breadcrumb[] = []
  private readonly events: AnalyticsEvent[] = []
  private readonly sinks: AnalyticsSink[] = []
  private remote: RemoteCrashSink | null = null
  private remoteLoading = false
  private crashReportsAllowed: boolean
  private installed = false
  private uploader: AnalyticsUploader | null = null

  private readonly handleError = (event: ErrorEvent): void => {
    this.capture(
      event.error ?? new Error(event.message),
      'error',
      `${event.filename}:${event.lineno}`,
    )
  }

  private readonly handleRejection = (event: PromiseRejectionEvent): void => {
    this.capture(event.reason, 'unhandledrejection', '')
  }

  constructor(save: SaveManager, options: TelemetryOptions) {
    this.save = save
    this.options = options
    this.crashReportsAllowed = options.crashReportsAllowed
    const analytics = options.analytics
    if (analytics?.apiKey.trim() && analytics.host.trim()) {
      this.uploader = new AnalyticsUploader(save, {
        host: analytics.host.trim(),
        apiKey: analytics.apiKey.trim(),
        platform: analytics.platform,
        version: options.version,
        isAllowed: () => this.crashReportsAllowed,
      })
      this.sinks.push(this.uploader)
    }
  }

  /** True when usage events are uploaded (a key is set and the player allows it). */
  get uploadsAnalytics(): boolean {
    return this.uploader !== null && this.crashReportsAllowed
  }

  /** Sends waiting analytics events now (e.g. as the app goes to the background). */
  flush(): void {
    if (this.uploader) {
      void this.uploader.flush()
      this.uploader.persist()
    }
  }

  /** Starts listening for uncaught errors. Call once, as early as possible. */
  install(): void {
    if (this.installed || typeof window === 'undefined') {
      return
    }
    this.installed = true
    window.addEventListener('error', this.handleError)
    window.addEventListener('unhandledrejection', this.handleRejection)
    this.syncRemote()
    this.uploader?.start()
  }

  setCrashReportsAllowed(allowed: boolean): void {
    this.crashReportsAllowed = allowed
    if (!allowed) {
      this.uploader?.clear()
    }
    this.syncRemote()
  }

  addAnalyticsSink(sink: AnalyticsSink): void {
    this.sinks.push(sink)
  }

  breadcrumb(category: string, message: string): void {
    this.breadcrumbs.push({ at: Date.now(), category, message })
    if (this.breadcrumbs.length > MAX_BREADCRUMBS) {
      this.breadcrumbs.shift()
    }
  }

  /** Records an analytics event and leaves a breadcrumb for crash reports. */
  track(name: string, props: AnalyticsProps = {}): void {
    const event: AnalyticsEvent = { name, at: Date.now(), props }
    this.events.push(event)
    if (this.events.length > MAX_EVENTS) {
      this.events.shift()
    }
    this.breadcrumb('event', name)
    for (const sink of this.sinks) {
      try {
        sink.send(event)
      } catch (error) {
        this.logger.warn(`Analytics sink failed for "${name}".`, error)
      }
    }
  }

  /** Records an error the game caught but still wants to know about. */
  captureException(error: unknown, context = ''): void {
    this.capture(error, 'caught', context)
  }

  /** Locally stored crashes, newest last (for a debug screen or a bug report). */
  crashLog(): readonly CrashRecord[] {
    const raw = this.save.load<unknown>(CRASH_LOG_KEY, [])
    return Array.isArray(raw) ? (raw as CrashRecord[]) : []
  }

  recentEvents(): readonly AnalyticsEvent[] {
    return this.events
  }

  clearCrashLog(): void {
    this.save.remove(CRASH_LOG_KEY)
  }

  dispose(): void {
    this.uploader?.dispose()
    if (this.installed) {
      window.removeEventListener('error', this.handleError)
      window.removeEventListener('unhandledrejection', this.handleRejection)
      this.installed = false
    }
  }

  private capture(reason: unknown, source: CrashRecord['source'], context: string): void {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    const record: CrashRecord = {
      at: Date.now(),
      message: error.message.slice(0, 500),
      stack: (error.stack ?? '').slice(0, MAX_STACK),
      source,
      context,
      version: this.options.version,
      breadcrumbs: [...this.breadcrumbs],
    }
    try {
      const log = [...this.crashLog(), record].slice(-MAX_CRASHES)
      this.save.save(CRASH_LOG_KEY, log)
    } catch {
      // Never let crash reporting itself crash the game.
    }
    if (this.crashReportsAllowed) {
      this.remote?.capture(error, record)
    }
  }

  private syncRemote(): void {
    const dsn = this.options.sentryDsn?.trim()
    if (!dsn || !this.crashReportsAllowed || this.remote || this.remoteLoading) {
      return
    }
    this.remoteLoading = true
    // The SDK lives in its own chunk and is only downloaded when enabled.
    void import('@sentry/browser')
      .then((Sentry) => {
        Sentry.init({
          dsn,
          release: `turkuaz-adalar@${this.options.version}`,
          environment: this.options.environment,
          sendDefaultPii: false,
          // Errors only: no performance tracing, session replay or user data.
          tracesSampleRate: 0,
          defaultIntegrations: false,
          integrations: [Sentry.dedupeIntegration(), Sentry.linkedErrorsIntegration()],
          beforeSend: (event) => {
            if (!this.crashReportsAllowed) {
              return null
            }
            delete event.user
            if (event.request) {
              delete event.request.headers
            }
            return event
          },
        })
        this.remote = {
          capture: (error, record) => {
            Sentry.withScope((scope) => {
              scope.setTag('source', record.source)
              if (record.context) {
                scope.setExtra('context', record.context)
              }
              scope.setExtra('breadcrumbs', record.breadcrumbs)
              Sentry.captureException(error)
            })
          },
        }
      })
      .catch((error: unknown) => {
        this.logger.warn('Crash reporting SDK failed to load; keeping the local log only.', error)
      })
      .finally(() => {
        this.remoteLoading = false
      })
  }
}
