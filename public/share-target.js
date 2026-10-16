// "Share to MinimalFrame" (Web Share Target). Loaded into the generated service worker via
// workbox.importScripts (see vite.config.js), so it runs before Workbox's own routes.
// The phone's share sheet POSTs the photos here; we park them in a cache and open the app,
// which picks them up (loadSharedFiles in App.svelte) and clears the cache.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== new URL("share-target", self.registration.scope).pathname) return;
  event.respondWith(
    (async () => {
      const form = await event.request.formData();
      const files = form.getAll("photos").filter((f) => f instanceof File);
      const cache = await caches.open("mf-shared");
      await Promise.all(
        files.map((f, i) =>
          cache.put(
            `shared/${Date.now()}_${i}?name=${encodeURIComponent(f.name)}`,
            new Response(f, { headers: { "content-type": f.type || "application/octet-stream" } }),
          ),
        ),
      );
      return Response.redirect(`${self.registration.scope}?shared=${files.length}`, 303);
    })(),
  );
});
