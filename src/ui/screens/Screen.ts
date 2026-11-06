import type { Button } from '../components/Button.ts'
import { createScreenRoot } from './screenUtils.ts'

/** Base class for full-screen UI states with explicit show/hide lifecycle. */
export abstract class Screen {
  readonly root: HTMLDivElement

  /** Open screens, most recent last; only the top one traps focus. */
  private static readonly openStack: Screen[] = []

  /** Element focused before this screen opened, restored when it closes. */
  private returnFocus: HTMLElement | null = null

  /**
   * Keeps Tab / Shift+Tab inside the open dialog (WAI-ARIA modal pattern), so
   * keyboard focus never wanders to controls behind it.
   */
  private readonly trapFocus = (event: KeyboardEvent): void => {
    const stack = Screen.openStack
    if (event.key !== 'Tab' || this.root.hidden || stack[stack.length - 1] !== this) {
      return
    }
    const focusable = this.focusableElements()
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    const inside = active instanceof HTMLElement && this.root.contains(active)
    if (event.shiftKey && (active === first || !inside)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault()
      first.focus()
    }
  }

  protected constructor(className: string) {
    this.root = createScreenRoot(className)
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-modal', 'true')
  }

  show(): void {
    if (this.root.hidden) {
      const active = document.activeElement
      this.returnFocus =
        active instanceof HTMLElement && !this.root.contains(active) ? active : null
      // Captured on the document so Tab is caught even when focus is outside.
      document.addEventListener('keydown', this.trapFocus, true)
      Screen.openStack.push(this)
    }
    this.root.hidden = false
    this.root.setAttribute('aria-hidden', 'false')
  }

  hide(): void {
    const wasOpen = !this.root.hidden
    this.root.hidden = true
    this.root.setAttribute('aria-hidden', 'true')
    document.removeEventListener('keydown', this.trapFocus, true)
    this.leaveStack()
    if (wasOpen && this.root.contains(document.activeElement)) {
      // Give focus back to whatever opened the dialog, if it is still shown.
      const target = this.returnFocus
      if (target?.isConnected && !target.closest('[hidden]')) {
        target.focus()
      } else {
        ;(document.activeElement as HTMLElement | null)?.blur()
      }
    }
    this.returnFocus = null
  }

  dispose(): void {
    document.removeEventListener('keydown', this.trapFocus, true)
    this.leaveStack()
    this.root.remove()
  }

  private leaveStack(): void {
    const index = Screen.openStack.indexOf(this)
    if (index >= 0) {
      Screen.openStack.splice(index, 1)
    }
  }

  private focusableElements(): HTMLElement[] {
    const selector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'
    return [...this.root.querySelectorAll<HTMLElement>(selector)].filter(
      (element) => !element.closest('[hidden]') && element.getClientRects().length > 0,
    )
  }

  protected focusWhenVisible(button: Button): void {
    if (!this.root.hidden) {
      button.focus()
    }
  }
}
