// Reise – keeps the app available offline. Stores no personal data.
const CACHE = "reise-v39";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./koffer-180.png", "./koffer-192.png", "./koffer-512.png", "./koffer-maskable-512.png", "./pdf.min.mjs", "./pdf.worker.min.mjs"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== "reise-share").map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  // Android: "Teilen -> Reise". Dateien oder Text kurz zwischenspeichern, die App liest sie beim Öffnen ein und löscht sie.
  if (e.request.method === "POST" && new URL(e.request.url).pathname.endsWith("/share-target")) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData(), c = await caches.open("reise-share");
        for (const k of await c.keys()) await c.delete(k);
        let i = 0;
        for (const f of fd.getAll("files")) if (f && f.size) await c.put("./shared/" + i++, new Response(f, { headers: { "x-name": encodeURIComponent(f.name || "Reisedatei.txt") } }));
        const text = [fd.get("text"), fd.get("title"), fd.get("url")].filter(Boolean).join("\n");
        if (text) await c.put("./shared/text", new Response(text));
      } catch (err) {}
      return Response.redirect("./?shared=1", 303);
    })());
    return;
  }
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // The page itself: newest version when online, saved copy when offline.
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request, { cache: "no-cache" }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("./index.html", copy)); }
      return res;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
