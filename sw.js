// Guarda a página para ela abrir mesmo com o servidor desligado: os dados
// continuam no navegador e sobem quando ele voltar. Sempre tenta a rede
// primeiro, então uma versão nova do app aparece no próximo F5.
const CACHE = "horas-v5";
// O idioma em uso entra no cache quando é carregado, como qualquer outro arquivo
const ARQUIVOS = ["/", "/app.js", "/inicio.js", "/calculo.js", "/feriados.js", "/idiomas/pt.js",
  "/icone.svg", "/manifest.webmanifest", "/fontes/plex-sans-latin-400.woff2", "/fontes/plex-sans-latin-600.woff2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    // Busca a página em paralelo com a partida do worker: a navegação não
    // fica esperando ele acordar
    await self.registration.navigationPreload?.enable();
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const chave = url => (url.pathname === "/index.html" ? "/" : url.pathname);

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // /dados e os backups nunca passam por aqui: o app já guarda a própria cópia
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/dados")) return;
  e.respondWith((async () => {
    try {
      const r = (await e.preloadResponse) ?? await fetch(e.request);
      if (r.ok) {
        const copia = r.clone();
        e.waitUntil(caches.open(CACHE).then(c => c.put(chave(url), copia)));
      }
      return r;
    } catch {
      return (await caches.match(chave(url))) ?? Response.error();
    }
  })());
});
