type LogLevel = 'error' | 'warn' | 'info' | 'debug'

interface LogContext {
  [key: string]: unknown
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  return JSON.stringify({
    level,
    message,
    ...context,
    timestamp: new Date().toISOString(),
  })
}

export const logger = {
  error(message: string, context?: LogContext): void {
    console.error(formatLog('error', message, context))
  },
  warn(message: string, context?: LogContext): void {
    console.warn(formatLog('warn', message, context))
  },
  info(message: string, context?: LogContext): void {
    console.info(formatLog('info', message, context))
  },
  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(formatLog('debug', message, context))
    }
  },
}
