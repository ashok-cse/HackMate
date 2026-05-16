import Papa from "papaparse";

export type UploadRow = Record<string, string>;

const REQUIRED = [
  "participant_id",
  "full_name",
  "email",
  "phone",
  "city",
  "hackathon_name",
  "consent_to_call",
] as const;

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Rough E.164 check: optional + and digits */
export function validPhone(phone: string): boolean {
  const t = phone.trim();
  if (!t.startsWith("+")) return /^[0-9]{8,15}$/.test(t.replace(/\s/g, ""));
  return /^\+[1-9]\d{7,14}$/.test(t.replace(/\s/g, ""));
}

export function parseParticipantsCsv(text: string): {
  rows: UploadRow[];
  errors: string[];
} {
  const parsed = Papa.parse<UploadRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  const errors: string[] = [];
  if (parsed.errors.length) {
    for (const e of parsed.errors.slice(0, 10)) {
      errors.push(e.message ?? "CSV parse error");
    }
  }

  const rows = parsed.data.filter((r) =>
    Object.values(r).some((v) => String(v ?? "").trim() !== ""),
  );

  if (rows.length === 0) errors.push("No data rows found.");

  const headers = parsed.meta.fields?.map((h) => h.toLowerCase()) ?? [];
  for (const col of REQUIRED) {
    if (!headers.includes(col)) errors.push(`Missing required column: ${col}`);
  }

  const emails = new Map<string, number>();
  const phones = new Map<string, number>();

  rows.forEach((row, idx) => {
    const line = idx + 2;
    const email = String(row.email ?? "").trim().toLowerCase();
    const phone = String(row.phone ?? "").trim();
    if (email && !validEmail(email))
      errors.push(`Row ${line}: invalid email`);
    if (phone && !validPhone(phone))
      errors.push(`Row ${line}: phone should be E.164 (+...) or digits`);

    if (email) emails.set(email, (emails.get(email) ?? 0) + 1);
    if (phone) phones.set(phone, (phones.get(phone) ?? 0) + 1);
  });

  for (const [e, c] of emails) {
    if (c > 1) errors.push(`Duplicate email in CSV: ${e}`);
  }
  for (const [p, c] of phones) {
    if (c > 1) errors.push(`Duplicate phone in CSV: ${p}`);
  }

  return { rows, errors: [...new Set(errors)] };
}
