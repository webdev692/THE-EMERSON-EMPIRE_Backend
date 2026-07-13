type LogContext = Record<string, string | number | boolean | null | undefined>;

const sensitiveKey = /(authorization|cookie|email|password|secret|token|url|key)/i;

function safeContext(value: unknown): LogContext | undefined {
  if (value instanceof Error) {
    return { errorType: value.name };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => !sensitiveKey.test(key) && ['string', 'number', 'boolean'].includes(typeof item))
      .map(([key, item]) => [key, item as string | number | boolean]),
  );
}

function write(
  method: 'log' | 'warn' | 'error',
  level: string,
  message: string,
  context?: unknown,
): void {
  const safe = safeContext(context);
  if (safe && Object.keys(safe).length > 0) {
    console[method](`[${level}] ${message}`, safe);
    return;
  }
  console[method](`[${level}] ${message}`);
}

export const logger = {
  info: (message: string, data?: unknown) => write('log', 'INFO', message, data),
  error: (message: string, error?: unknown) => write('error', 'ERROR', message, error),
  warn: (message: string, data?: unknown) => write('warn', 'WARN', message, data),
  success: (message: string, data?: unknown) => write('log', 'SUCCESS', message, data),
};
