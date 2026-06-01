export function parseTimezoneOffset(raw, fallback = 180) {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === "string" && raw.trim() === "") return fallback;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
