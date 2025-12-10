// Copyright (C) 2025 Aron Sommer. See LICENSE file for full license details.

// Cache version - injected at build time by deploy.yml
const CACHE_VERSION = "__BUILD_TIMESTAMP__";
const CACHE_NAME = `openmapeditor-${CACHE_VERSION}`;

// Critical files to pre-cache during installation
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/style.css",
  "/credits.html",
  "/manifest.json",
  "/flag-icons-7.5.0/flags/1x1/de.svg",
  "/flag-icons-7.5.0/flags/1x1/ch.svg",
];

// Install event - pre-cache critical files
self.addEventListener("install", (event) => {
  console.log("[ServiceWorker] Installing...");
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("[ServiceWorker] Pre-caching critical files:", PRECACHE_URLS);
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches and take control
self.addEventListener("activate", (event) => {
  console.log("[ServiceWorker] Activating...");
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log("[ServiceWorker] Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - Network First strategy with automatic caching and timeout
self.addEventListener("fetch", (event) => {
  // Skip cross-origin requests (external APIs, map tiles, etc)
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    (async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      try {
        const response = await fetch(event.request, { signal: controller.signal });
        clearTimeout(timeoutId);

        // Clone the response before caching
        const responseToCache = response.clone();

        // Cache successful GET requests
        if (event.request.method === "GET" && response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }

        return response;
      } catch (error) {
        clearTimeout(timeoutId);

        // Network failed or timed out, try cache
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // If no cache and it's an HTML request, return the main page
        const acceptHeader = event.request.headers.get("accept");
        if (acceptHeader && acceptHeader.includes("text/html")) {
          return caches.match("/index.html");
        }

        throw error;
      }
    })()
  );
});
