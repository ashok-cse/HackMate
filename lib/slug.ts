export function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "event";
}

export function uniqueSlug(base: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  const b = slugify(base);
  return `${b}-${suffix}`;
}
