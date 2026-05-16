import { randomBytes } from "node:crypto";

/** Unguessable token for the private voice-assessment page (email link). */
export function newVoiceInviteToken(): string {
  return randomBytes(32).toString("hex");
}
