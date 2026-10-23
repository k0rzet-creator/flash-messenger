const CACHE_NAME = "flash-v1";

const ASSETS = [
    "/",
    "/index.html",
    "/web.html",
    "/style.css",
    "/app.js",
    "/manifest.json",
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/android-chrome-192x192.png",
    "/android-chrome-512x512.png",
];

self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS).catch((e) => {
                console.warn("cache addAll error:", e);
            });
        })
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((k) => k !== CACHE_NAME)
                    .map((k) => caches.delete(k))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;
    if (!event.request.url.startsWith("http")) return;

    event.respondWith(
        fetch(event.request)
            .then((res) => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then((c) => {
                    c.put(event.request, clone).catch(() => {});
                });
                return res;
            })
            .catch(() => caches.match(event.request))
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if ("focus" in client) {
                        client.focus();
                        client.postMessage({
                            type: "OPEN_CHAT",
                            chat_id: event.notification.data?.chat_id,
                        });
                        return;
                    }
                }
                if (self.clients.openWindow) {
                    return self.clients.openWindow("/web.html");
                }
            })
    );
});