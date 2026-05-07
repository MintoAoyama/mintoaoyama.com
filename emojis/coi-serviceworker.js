/*!
 * Based on coi-serviceworker v0.1.7 by Guido Zuidhof and contributors (MIT License)
 * https://github.com/gzuidhof/coi-serviceworker
 *
 * Modified for emojis: merged with sw.js to also handle offline caching
 * for same-origin assets (emoji.json, hashed Vite assets, etc.)
 */
const CACHE_VERSION = 'v4';
const CACHE_NAME = `emojis-${CACHE_VERSION}`;

let coepCredentialless = false;
if (typeof window === 'undefined') {
    self.addEventListener("install", (event) => {
        event.waitUntil(caches.open(CACHE_NAME));
        self.skipWaiting();
    });
    self.addEventListener("activate", (event) => {
        event.waitUntil(
            Promise.all([
                self.clients.claim(),
                caches.keys().then((keys) =>
                    Promise.all(
                        keys
                            .filter((key) => key.startsWith('emojis-') && key !== CACHE_NAME)
                            .map((key) => caches.delete(key))
                    )
                ),
            ])
        );
    });

    self.addEventListener("message", (ev) => {
        if (!ev.data) {
            return;
        } else if (ev.data.type === "deregister") {
            self.registration
                .unregister()
                .then(() => {
                    return self.clients.matchAll();
                })
                .then(clients => {
                    clients.forEach((client) => client.navigate(client.url));
                });
        } else if (ev.data.type === "coepCredentialless") {
            coepCredentialless = ev.data.value;
        } else if (ev.data.type === "SKIP_WAITING") {
            self.skipWaiting();
        }
    });

    // Build a Response with COOP/COEP/CORP headers added — required for crossOriginIsolated.
    function withCoopCoepHeaders(response) {
        if (response.status === 0) return response;
        const newHeaders = new Headers(response.headers);
        newHeaders.set("Cross-Origin-Embedder-Policy",
            coepCredentialless ? "credentialless" : "require-corp"
        );
        if (!coepCredentialless) {
            newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
        }
        newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
        });
    }

    self.addEventListener("fetch", function (event) {
        const r = event.request;
        if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
            return;
        }
        // Skip WebSocket upgrade requests (e.g. Vite HMR)
        if (r.mode === "websocket") {
            return;
        }

        const url = new URL(r.url);
        const sameOrigin = url.origin === self.location.origin;

        // Cross-origin (e.g. WebLLM model fetches from HuggingFace) — only handle COEP, no caching.
        if (!sameOrigin) {
            const request = (coepCredentialless && r.mode === "no-cors")
                ? new Request(r, { credentials: "omit" })
                : r;
            event.respondWith(
                fetch(request)
                    .then(withCoopCoepHeaders)
                    .catch((e) => console.error(e))
            );
            return;
        }

        // Same-origin: combine caching strategy from sw.js with COOP/COEP header injection.

        // Navigation requests (HTML): Network First — always fetch latest HTML so hashed asset
        // references stay in sync. Falls back to cache when offline.
        if (r.mode === 'navigate') {
            event.respondWith(
                fetch(r).then((response) => {
                    if (response.ok) {
                        caches.open(CACHE_NAME).then((c) => c.put(r, response.clone()));
                    }
                    return withCoopCoepHeaders(response);
                }).catch(() => caches.match(r).then((cached) =>
                    cached ? withCoopCoepHeaders(cached) : Response.error()
                ))
            );
            return;
        }

        // Vite hashed assets: Network First (hash changes on rebuild, cache-first would 404).
        const isHashedAsset = /\/assets\/[^/]+-[A-Za-z0-9]{8,}\.(js|css)(\?.*)?$/.test(url.pathname);

        if (isHashedAsset) {
            event.respondWith(
                fetch(r)
                    .then((response) => {
                        if (response.ok) {
                            const clone = response.clone();
                            caches.open(CACHE_NAME).then((cache) => cache.put(r, clone));
                        }
                        return withCoopCoepHeaders(response);
                    })
                    .catch(() => caches.match(r).then((cached) =>
                        cached ? withCoopCoepHeaders(cached) : Response.error()
                    ))
            );
            return;
        }

        // Cache First for everything else (emoji.json, icons, html, etc.)
        event.respondWith(
            caches.match(r).then((cached) => {
                if (cached) return withCoopCoepHeaders(cached);
                return fetch(r).then((response) => {
                    if (response.ok && r.method === 'GET') {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(r, clone));
                    }
                    return withCoopCoepHeaders(response);
                });
            }).catch((e) => {
                console.error(e);
                return Response.error();
            })
        );
    });

} else {
    (() => {
        const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
        window.sessionStorage.removeItem("coiReloadedBySelf");
        const coepDegrading = (reloadedBySelf == "coepdegrade");

        // You can customize the behavior of this script through a global `coi` variable.
        const coi = {
            shouldRegister: () => !reloadedBySelf,
            shouldDeregister: () => false,
            coepCredentialless: () => true,
            coepDegrade: () => true,
            doReload: () => window.location.reload(),
            quiet: false,
            ...window.coi
        };

        const n = navigator;
        const controlling = n.serviceWorker && n.serviceWorker.controller;

        // Record the failure if the page is served by serviceWorker.
        if (controlling && !window.crossOriginIsolated) {
            window.sessionStorage.setItem("coiCoepHasFailed", "true");
        }
        const coepHasFailed = window.sessionStorage.getItem("coiCoepHasFailed");

        if (controlling) {
            // Reload only on the first failure.
            const reloadToDegrade = coi.coepDegrade() && !(
                coepDegrading || window.crossOriginIsolated
            );
            n.serviceWorker.controller.postMessage({
                type: "coepCredentialless",
                value: (reloadToDegrade || coepHasFailed && coi.coepDegrade())
                    ? false
                    : coi.coepCredentialless(),
            });
            if (reloadToDegrade) {
                !coi.quiet && console.log("Reloading page to degrade COEP.");
                window.sessionStorage.setItem("coiReloadedBySelf", "coepdegrade");
                coi.doReload("coepdegrade");
            }

            if (coi.shouldDeregister()) {
                n.serviceWorker.controller.postMessage({ type: "deregister" });
            }
        }

        // If we're already coi: do nothing. Perhaps it's due to this script doing its job, or COOP/COEP are
        // already set from the origin server. Also if the browser has no notion of crossOriginIsolated, just give up here.
        if (window.crossOriginIsolated !== false || !coi.shouldRegister()) return;

        if (!window.isSecureContext) {
            !coi.quiet && console.log("COOP/COEP Service Worker not registered, a secure context is required.");
            return;
        }

        // In some environments (e.g. Firefox private mode) this won't be available
        if (!n.serviceWorker) {
            !coi.quiet && console.error("COOP/COEP Service Worker not registered, perhaps due to private mode.");
            return;
        }

        n.serviceWorker.register(window.document.currentScript.src).then(
            (registration) => {
                !coi.quiet && console.log("COOP/COEP Service Worker registered", registration.scope);

                registration.addEventListener("updatefound", () => {
                    !coi.quiet && console.log("Reloading page to make use of updated COOP/COEP Service Worker.");
                    window.sessionStorage.setItem("coiReloadedBySelf", "updatefound");
                    coi.doReload();
                });

                // If the registration is active, but it's not controlling the page
                if (registration.active && !n.serviceWorker.controller) {
                    !coi.quiet && console.log("Reloading page to make use of COOP/COEP Service Worker.");
                    window.sessionStorage.setItem("coiReloadedBySelf", "notcontrolling");
                    coi.doReload();
                }
            },
            (err) => {
                !coi.quiet && console.error("COOP/COEP Service Worker failed to register:", err);
            }
        );
    })();
}
