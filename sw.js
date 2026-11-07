// Glam Studio service worker: opens instantly, plays with no internet, updates quietly in the background.
// V and SHELL are filled in by tools/stamp.py. Don't edit them by hand.
const V = "gs-e16d065703";
const SHELL = ["./", "./manifest.webmanifest", "./apple-touch-icon.png", "./icon-192.png", "./icon-512.png", "./fonts/fonts.css", "./fonts/baloo-2-latin-600-normal.woff2", "./fonts/baloo-2-latin-800-normal.woff2", "./fonts/nunito-latin-600-normal.woff2", "./fonts/nunito-latin-800-normal.woff2", "./vendor/three.min.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const scope = new URL(self.registration.scope);
  const isHome = req.mode === "navigate" && (url.pathname === scope.pathname || url.pathname === scope.pathname + "index.html");
  const key = isHome ? "./" : req;
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(key, { ignoreSearch: isHome });
    const net = fetch(isHome ? new Request("./", { cache: "no-cache" }) : req).then(r => { if (r && r.ok) c.put(key, r.clone()); return r; }).catch(() => hit);
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  }));
});
