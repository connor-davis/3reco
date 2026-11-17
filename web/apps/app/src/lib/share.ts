/**
 * Builds a WhatsApp share link: the short text, then the absolute page URL.
 * Everything is encoded so `&`, `+`, `#` and `%` in a name stay in the text
 * instead of cutting the link short. Never put contact details in the text.
 */
export function whatsAppUrl(
  text: string,
  path: string,
  origin: string = window.location.origin
): string {
  const pageUrl = new URL(path, origin).href;

  return `https://wa.me/?text=${encodeURIComponent(`${text} ${pageUrl}`)}`;
}
