// Offline mode: while registered, serves same-scope requests from the saved snapshot even
// when the network is available (except the settings page, see below). The offline page (/offline/) downloads the
// snapshot, registers this worker, and unregisters it when offline mode is turned off.
// Keep the names below in sync with src/pages/offline/index.astro.
const scope = new URL(self.registration.scope).pathname;
const META = `offline-meta:${scope}`;
const STATE_KEY = `${scope}offline-state`;
const BYPASS = 'offline-bypass';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Cross-origin requests (Google Fonts) go to the network as usual; offline they fail
  // and the pages fall back to the device's own fonts.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(scope) || url.searchParams.has(BYPASS)) return;
  event.respondWith(fromSnapshot(request, url));
});

async function snapshot() {
  const state = await (await caches.open(META)).match(STATE_KEY);
  if (!state) return null;
  const { cache } = await state.json();
  return (await caches.has(cache)) ? caches.open(cache) : null;
}

async function fromSnapshot(request, url) {
  const cache = await snapshot();
  // The browser may have evicted the saved data; behave like the normal site then.
  if (!cache) return fetch(request);
  // Keys are pathnames, so query strings such as Pagefind's "?ts=" are ignored.
  const path = url.pathname.replace(/\/index\.html$/, '/');
  // The settings page is the way out of offline mode, so it is taken from the network when
  // possible: a fix to it must not be locked out by an older snapshot.
  if (path === `${scope}offline/`) {
    try {
      return await fetch(request);
    } catch {
      // Offline: fall through to the saved copy.
    }
  }
  const hit = await cache.match(path);
  if (hit) return hit;
  // Saved pages only refer to saved files; a miss comes from the live settings page
  // (e.g. a stylesheet renamed by a later build).
  if (request.mode !== 'navigate') return fetch(request).catch(() => new Response('', { status: 504 }));
  if (!path.endsWith('/') && (await cache.match(`${path}/`))) return Response.redirect(`${path}/${url.hash}`, 301);
  return notSaved();
}

function notSaved() {
  const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>保存されていないページ</title>
<style>:root{color-scheme:light dark}body{font-family:"Hiragino Sans","Noto Sans JP",sans-serif;max-width:640px;margin:48px auto;padding:0 16px;line-height:1.8}</style>
<h1>保存されていないページ</h1>
<p>オフラインモードで保存した版に、このページは含まれていない。</p>
<p><a href="${scope}offline/">オフラインモードの設定</a>で保存した版を更新するか、オフラインモードをオフにして開き直してほしい。</p>
</html>`;
  return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
