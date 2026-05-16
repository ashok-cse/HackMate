export function transcriptToText(transcript: unknown): string {
  if (typeof transcript === "string") return transcript;
  if (Array.isArray(transcript)) {
    return transcript
      .map((t: { role?: string; speaker?: string; text?: string; content?: string; message?: string }) => {
        const role = t.role ?? t.speaker ?? "user";
        const text = t.text ?? t.content ?? t.message ?? "";
        return `${role}: ${text}`;
      })
      .join("\n");
  }
  if (transcript && typeof transcript === "object" && "text" in transcript) {
    return String((transcript as { text?: string }).text ?? "");
  }
  return "";
}
