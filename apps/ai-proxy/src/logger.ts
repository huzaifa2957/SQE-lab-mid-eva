// Server log (RL-06). Detailed errors go here, never to the client; secrets are redacted.

export interface Logger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return typeof error === 'string' ? error : 'Unknown error';
}

/** A console logger that replaces every secret value with "[redacted]". */
export function createLogger(
  secrets: readonly string[],
  sink: Pick<Console, 'info' | 'error'> = console,
): Logger {
  const values = secrets.filter((s) => s.length > 0);
  const redact = (text: string) =>
    values.reduce((out, secret) => out.split(secret).join('[redacted]'), text);
  return {
    info: (message) => sink.info(redact(`[ai-proxy] ${message}`)),
    error: (message, error) =>
      sink.error(
        redact(`[ai-proxy] ${message}${error === undefined ? '' : ` — ${describe(error)}`}`),
      ),
  };
}
