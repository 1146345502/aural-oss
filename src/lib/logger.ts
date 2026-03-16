type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, -1);
}

function fmt(level: LogLevel, mod: string): string {
  return `${ts()} ${level.toUpperCase().padEnd(5)} [${mod}]`;
}

export type Logger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export function createLogger(mod: string): Logger {
  return {
    debug(...args: unknown[]) {
      if (LEVELS.debug >= LEVELS[MIN_LEVEL])
        console.debug(fmt("debug", mod), ...args);
    },
    info(...args: unknown[]) {
      if (LEVELS.info >= LEVELS[MIN_LEVEL])
        console.log(fmt("info", mod), ...args);
    },
    warn(...args: unknown[]) {
      if (LEVELS.warn >= LEVELS[MIN_LEVEL])
        console.warn(fmt("warn", mod), ...args);
    },
    error(...args: unknown[]) {
      console.error(fmt("error", mod), ...args);
    },
  };
}

export const logger = createLogger("app");
