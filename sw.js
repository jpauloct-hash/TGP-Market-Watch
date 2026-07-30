const CACHE = "tgp-market-watch-v6";
const ASSETS = [
  "./",
  "./manifest.json",
  "./sw.js",
  "./apple-touch-icon.png",
  "./tgp-icon.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // cacheia cada item de forma tolerante: se um falhar, não derruba todo o cache
      Promise.allSettled(ASSETS.map((u) => c.add(u)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      // remove TODOS os caches antigos (inclui tgp-market-watch-v1..v5 presos nos aparelhos)
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estratégia de fetch:
//  - Navegação / HTML  → NETWORK-FIRST (resolve o "preso na versão antiga"):
//    busca a rede primeiro, atualiza o cache e serve o novo; offline → cai pro cache.
//  - Demais assets      → CACHE-FIRST (rápido; ícones/manifest raramente mudam),
//    com atualização em segundo plano.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // detecta pedido de navegação (abrir o app / recarregar) ou o próprio index.html
  const isNavigation =
    req.mode === "navigate" ||
    (sameOrigin && (url.pathname === "/" ||
                    url.pathname.endsWith("/index.html")));

  if (isNavigation) {
    // NETWORK-FIRST
    e.respondWith(
      fetch(req)
        .then((res) => {
          // guarda a cópia nova do HTML para uso offline
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          // sem rede: usa o que tiver no cache (index.html, o próprio req, ou a raiz "./")
          caches.match(req).then((c) => c || caches.match("./index.html")).then((c) => c || caches.match("./"))
        )
    );
    return;
  }

  // CACHE-FIRST para assets estáticos (com refresh silencioso em segundo plano)
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (sameOrigin && res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
