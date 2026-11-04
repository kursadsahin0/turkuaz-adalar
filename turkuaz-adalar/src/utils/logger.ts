type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const PREFIX = '[Turkuaz Adalar]'

export class Logger {
  private readonly scope: string

  constructor(scope: string) {
    this.scope = scope
  }

  debug(...args: unknown[]): void {
    this.write('debug', args)
  }

  info(...args: unknown[]): void {
    this.write('info', args)
  }

  warn(...args: unknown[]): void {
    this.write('warn', args)
  }

  error(...args: unknown[]): void {
    this.write('error', args)
  }

  private write(level: LogLevel, args: unknown[]): void {
    const label = `${PREFIX} [${this.scope}]`
    switch (level) {
      case 'debug':
        console.debug(label, ...args)
        break
      case 'info':
        console.info(label, ...args)
        break
      case 'warn':
        console.warn(label, ...args)
        break
      case 'error':
        console.error(label, ...args)
        break
    }
  }
}
