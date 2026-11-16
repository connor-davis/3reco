// Registers the service worker that keeps the app files and shows phone
// alerts. Only the production build does it: in dev the worker would serve
// stale files while the code changes.
export function registerServiceWorker(
  production: boolean,
  nav: Pick<Navigator, 'serviceWorker'> | undefined = globalThis.navigator
) {
  if (!production || !nav || !('serviceWorker' in nav)) return;
  // A failed registration only means no install and no alerts; the app works.
  void nav.serviceWorker.register('/sw.js').catch(() => undefined);
}
