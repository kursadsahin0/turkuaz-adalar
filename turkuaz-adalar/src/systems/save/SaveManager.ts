import { Logger } from '../../utils/logger.ts'

interface SaveEnvelope<T> {
  version: number
  data: T
}

/**
 * Versioned, namespaced localStorage wrapper. Storage failures (private mode,
 * quota, corrupt JSON) degrade gracefully to in-memory defaults.
 */
export class SaveManager {
  readonly available: boolean

  private readonly namespace: string
  private readonly version: number
  private readonly logger = new Logger('Save')

  constructor(namespace = 'turkuaz-adalar', version = 1) {
    this.namespace = namespace
    this.version = version
    this.available = this.checkAvailability()
  }

  load<T>(key: string, fallback: T): T {
    if (!this.available) {
      return fallback
    }

    try {
      const raw = window.localStorage.getItem(this.storageKey(key))
      if (!raw) {
        return fallback
      }

      const envelope = JSON.parse(raw) as SaveEnvelope<T>
      if (!envelope || envelope.version !== this.version) {
        return fallback
      }

      return envelope.data
    } catch (error) {
      this.logger.warn(`Could not read "${key}".`, error)
      return fallback
    }
  }

  save<T>(key: string, data: T): boolean {
    if (!this.available) {
      return false
    }

    try {
      const envelope: SaveEnvelope<T> = { version: this.version, data }
      window.localStorage.setItem(this.storageKey(key), JSON.stringify(envelope))
      return true
    } catch (error) {
      this.logger.warn(`Could not write "${key}".`, error)
      return false
    }
  }

  remove(key: string): void {
    if (!this.available) {
      return
    }
    try {
      window.localStorage.removeItem(this.storageKey(key))
    } catch (error) {
      this.logger.warn(`Could not remove "${key}".`, error)
    }
  }

  private storageKey(key: string): string {
    return `${this.namespace}:${key}`
  }

  private checkAvailability(): boolean {
    try {
      const probe = `${this.namespace}:__probe`
      window.localStorage.setItem(probe, '1')
      window.localStorage.removeItem(probe)
      return true
    } catch {
      return false
    }
  }
}
