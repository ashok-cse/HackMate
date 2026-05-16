/**
 * Easypanel/Docker often attach logging to the **running service stream**, not the shell opened via "Terminal".
 * Use **Logs** for the app container to see these lines.
 *
 * Writes newline-delimited JSON to stderr so panels that only ingest stderr still capture output.
 */
export function hackmateServerLog(
  scope: string,
  message: string,
  meta?: Record<string, unknown>,
  level: "info" | "warn" | "error" = "info",
): void {
  const line =
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      scope,
      msg: message,
      ...meta,
    }) + "\n";
  process.stderr.write(line);
}
