import type { SaveManager } from '../save/SaveManager.ts'
import type { AnalyticsEvent, AnalyticsSink } from './Telemetry.ts'

const QUEUE_KEY = 'analytics_queue'
const INSTALL_ID_KEY = 'install_id'
/** Upload as soon as this many events are waiting... */
const BATCH_SIZE = 20
/** ...or at least this often while the app is open. */
const FLUSH_INTERVAL_MS = 30_000
/** Events kept while offline; the oldest are dropped first. */
const MAX_QUEUED = 500

export interface AnalyticsUploaderOptions {
  /** Base URL of a PostHog-compatible ingestion API, e.g. https://eu.i.posthog.com */
  readonly host: string
  /** Project API key (public, write-only: it can send events, not read them). */
  readonly apiKey: string
  readonly version: string
  readonly platform: string
  /** Player setting, checked on every send and upload. */
  readonly isAllowed: () => boolean
  readonly fetchImpl?: typeof fetch
}

/** A random id for this installation: no account, device id or advertising id. */
export function installIdOf(save: SaveManager): string {
  const existing = save.load<string>(INSTALL_ID_KEY, '')
  if (existing) {
    return existing
  }
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  save.save(INSTALL_ID_KEY, id)
  return id
}

interface QueuedEvent {
  readonly event: string
  readonly timestamp: string
  readonly properties: Record<string, unknown>
}

/**
 * Sends analytics events in batches to a PostHog-compatible `/batch/`
 * endpoint (PostHog Cloud's free tier gives funnels and retention: where
 * players stop). Nothing is sent unless a key is configured *and* the player
 * allows anonymous usage data; events wait on the device while offline.
 */
export class AnalyticsUploader implements AnalyticsSink {
  private readonly save: SaveManager
  private readonly options: AnalyticsUploaderOptions
  private readonly installId: string
  private readonly endpoint: string
  private queue: QueuedEvent[]
  private uploading = false
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(save: SaveManager, options: AnalyticsUploaderOptions) {
    this.save = save
    this.options = options
    this.installId = installIdOf(save)
    this.endpoint = `${options.host.replace(/\/+$/, '')}/batch/`
    const stored = save.load<unknown>(QUEUE_KEY, [])
    this.queue = Array.isArray(stored) ? (stored as QueuedEvent[]).slice(-MAX_QUEUED) : []
  }

  start(): void {
    if (this.timer === null && typeof setInterval === 'function') {
      this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS)
    }
  }

  send(event: AnalyticsEvent): void {
    if (!this.options.isAllowed()) {
      return
    }
    this.queue.push({
      event: event.name,
      timestamp: new Date(event.at).toISOString(),
      properties: {
        ...event.props,
        distinct_id: this.installId,
        app_version: this.options.version,
        platform: this.options.platform,
        // Anonymous events: no person profiles are built from them.
        $process_person_profile: false,
      },
    })
    if (this.queue.length > MAX_QUEUED) {
      this.queue.splice(0, this.queue.length - MAX_QUEUED)
    }
    if (this.queue.length >= BATCH_SIZE) {
      void this.flush()
    }
  }

  /** Player turned usage data off: forget what has not been sent. */
  clear(): void {
    this.queue = []
    this.save.remove(QUEUE_KEY)
  }

  /** Keeps unsent events for the next launch (the app may be killed in the background). */
  persist(): void {
    if (this.queue.length > 0) {
      this.save.save(QUEUE_KEY, this.queue)
    } else {
      this.save.remove(QUEUE_KEY)
    }
  }

  async flush(): Promise<void> {
    if (!this.options.isAllowed()) {
      this.clear()
      return
    }
    if (this.uploading || this.queue.length === 0) {
      return
    }
    const fetchImpl = this.options.fetchImpl ?? (typeof fetch === 'function' ? fetch : null)
    if (!fetchImpl) {
      return
    }
    const batch = this.queue.slice(0, 100)
    this.uploading = true
    try {
      const response = await fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: this.options.apiKey, batch }),
        keepalive: true,
      })
      // 4xx other than rate limiting will never succeed: drop the batch.
      if (
        response.ok ||
        (response.status >= 400 && response.status < 500 && response.status !== 429)
      ) {
        this.queue.splice(0, batch.length)
      }
    } catch {
      // Offline: try again later.
    } finally {
      this.uploading = false
      this.persist()
    }
  }

  dispose(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.persist()
  }
}
