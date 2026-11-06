type Listener<T> = (payload: T) => void

/**
 * Minimal strongly typed event emitter. Listeners are stored in a map so
 * adding/removing systems does not require a custom class per event.
 */
export class EventEmitter<TEvents extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof TEvents, Set<Listener<never>>>()

  on<TKey extends keyof TEvents>(event: TKey, listener: Listener<TEvents[TKey]>): () => void {
    let listeners = this.listeners.get(event)
    if (!listeners) {
      listeners = new Set<Listener<never>>()
      this.listeners.set(event, listeners)
    }

    const stored = listener as Listener<never>
    listeners.add(stored)
    return () => {
      listeners?.delete(stored)
    }
  }

  emit<TKey extends keyof TEvents>(event: TKey, payload: TEvents[TKey]): void {
    const listeners = this.listeners.get(event)
    if (!listeners) {
      return
    }

    for (const listener of listeners) {
      ;(listener as Listener<TEvents[TKey]>)(payload)
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}
