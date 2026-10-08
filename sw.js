// Reise – keeps the app available offline. Stores no personal data.
const CACHE = "reise-v50";
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
  if (url.origin !== location.origin || e.request.headers.has("authorization")) return;   // Abgleich nie aus dem Speicher
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

// Erinnerungen: der eigene Speicher schickt nur ein leeres Signal. Text und Zeitpunkt liegen hier auf dem Handy (IndexedDB „reise-push“).
function pushDb() { return new Promise((res, rej) => { const r = indexedDB.open("reise-push", 1); r.onupgradeneeded = () => r.result.createObjectStore("items", { keyPath: "k" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function showDue() {
  let db, due = [];
  try {
    db = await pushDb();
    const all = await new Promise((res, rej) => { const q = db.transaction("items").objectStore("items").getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    const now = Date.now();
    due = all.filter((x) => !x.shown && x.at <= now + 120000 && x.at > now - 6 * 3600000).sort((a, b) => a.at - b.at);
    if (due.length) await new Promise((res) => { const tx = db.transaction("items", "readwrite"), st = tx.objectStore("items"); for (const x of due) st.put({ ...x, shown: true }); tx.oncomplete = res; tx.onerror = res; });
  } catch (e) {}
  finally { if (db) db.close(); }
  if (!due.length) return self.registration.showNotification("Reise", { body: "Eine Erinnerung ist fällig. Öffne die App.", tag: "rem-allgemein", icon: "koffer-192.png" });
  for (const x of due) await self.registration.showNotification(x.title, { body: x.body || "", tag: x.k, icon: "koffer-192.png", data: { url: x.url || "./" } });
}
self.addEventListener("push", (e) => { e.waitUntil(showDue()); });
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if (c.url.startsWith(self.registration.scope) && "navigate" in c) return c.navigate(url).then((w) => (w || c).focus());
    return self.clients.openWindow(url);
  }));
});
