/* eslint-disable no-console */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function emitLog(level: LogLevel, event: string, data?: Record<string, unknown>): void {
    const entry = { level, event, ...data };
    if (level === 'error') console.error(JSON.stringify(entry));
    else if (level === 'warn') console.warn(JSON.stringify(entry));
    else console.log(JSON.stringify(entry));
}

export const logger = {
    debug: (event: string, data?: Record<string, unknown>): void => emitLog('debug', event, data),
    info:  (event: string, data?: Record<string, unknown>): void => emitLog('info', event, data),
    warn:  (event: string, data?: Record<string, unknown>): void => emitLog('warn', event, data),
    error: (event: string, err: unknown, data?: Record<string, unknown>): void => {
        const errData = err instanceof Error
            ? { message: err.message, stack: err.stack }
            : { raw: String(err) };
        emitLog('error', event, { ...errData, ...data });
    },
};
