/** Escape untrusted text before interpolating it into third-party map HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Restrict telephone links to dialable characters. */
export function telephoneHref(value: unknown): string {
  return String(value ?? '').replace(/[^0-9+*#(),.\-\s]/g, '');
}
