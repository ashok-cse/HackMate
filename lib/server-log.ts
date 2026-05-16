/**
 * Easypanel/Docker often attach logging to the **running service stream**, not the shell opened via "Terminal".
 * Use **Logs** for the app container to see those streams.
 *
 * The standalone server (`node server.js`) inherits Node’s **stdout** (Next banner, etc.) and **stderr**
 * (`hackmateServerLog`). Platforms typically merge both into the **Logs** tab for the container.
 *
 * Writes newline-delimited JSON to stderr so panels that only ingest stderr still capture HackMate lines.
 */

/** Safe-length snippet for stderr JSON logs (avoid huge payloads). */
export function truncateForStderrLog(value: string | undefined, maxChars = 512): string | undefined {
  if (!value) return undefined;
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxChars) return oneLine;
  return `${oneLine.slice(0, maxChars)}…`;
}

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
