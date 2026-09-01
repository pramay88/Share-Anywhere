type LogData = unknown;

const isDevelopment = import.meta.env.DEV;

export const logger = {
    debug(message: string, data?: LogData) {
        if (isDevelopment) {
            console.debug(`[DEBUG] ${message}`, data ?? "");
        }
    },

    info(message: string, data?: LogData) {
        if (isDevelopment) {
            console.info(`[INFO] ${message}`, data ?? "");
        }
    },

    warn(message: string, data?: LogData) {
        if (isDevelopment) {
            console.warn(`[WARN] ${message}`, data ?? "");
        }
    },

    error(message: string, error?: unknown) {
        console.error(`[ERROR] ${message}`, error ?? "");
    },
};