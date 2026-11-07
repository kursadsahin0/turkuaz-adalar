import { App } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { Logger } from '../utils/logger.ts'

export interface NativeBridgeHandlers {
  /** Android hardware/gesture back. Return false to let the app exit. */
  onBack: () => boolean
  /** App moved to the background (home button, app switcher, call). */
  onBackground: () => void
  onForeground: () => void
}

/**
 * Connects the game to native app events on Android/iOS. On the web this is
 * a no-op: the browser handles back navigation and `visibilitychange`.
 */
export class NativeBridge {
  private readonly logger = new Logger('Native')
  private readonly handles: PluginListenerHandle[] = []
  private disposed = false

  static get isNative(): boolean {
    return Capacitor.isNativePlatform()
  }

  async attach(handlers: NativeBridgeHandlers): Promise<void> {
    if (!NativeBridge.isNative) {
      return
    }
    try {
      const back = await App.addListener('backButton', () => {
        if (!handlers.onBack()) {
          void App.exitApp()
        }
      })
      const state = await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          handlers.onForeground()
        } else {
          handlers.onBackground()
        }
      })
      if (this.disposed) {
        void back.remove()
        void state.remove()
        return
      }
      this.handles.push(back, state)
    } catch (error) {
      this.logger.warn('Native app events are unavailable.', error)
    }
  }

  dispose(): void {
    this.disposed = true
    for (const handle of this.handles) {
      void handle.remove()
    }
    this.handles.length = 0
  }
}
