const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "/": "&#x2F;",
  "`": "&#x60;",
  "=": "&#x3D;",
};

/** Escape untrusted text for safe interpolation into HTML (text & attribute contexts). */
export function escapeHtml(input: unknown): string {
  return String(input ?? "").replace(/[&<>"'`=/]/g, (c) => HTML_ESCAPES[c] ?? c);
}

/** Remove CR/LF and control chars – prevents header injection in email subjects. */
export function sanitizeHeader(input: string, max = 180): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
}

/** Only allow http(s) URLs in links; anything else becomes "#". */
export function safeUrl(input: string | undefined | null): string {
  if (!input) return "#";
  try {
    const u = new URL(input);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "#";
  } catch {
    return "#";
  }
}
