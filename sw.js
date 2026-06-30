// ============================================================
// カードバトル sw.js
// Version : 1.0.0
// Updated : 2025-06-30
// ============================================================

const CACHE_NAME = "hduel-v1.4.0";

const STATIC_FILES = [
  "./index.html",
  "./game.js",
  "./card_data.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

// インストール：静的ファイルをキャッシュ
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_FILES);
    })
  );
  self.skipWaiting();
});

// アクティベート：古いキャッシュを削除
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// フェッチ：キャッシュ優先（cards/ 画像はネットワーク優先）
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // cards/ 配下の画像はネットワーク優先（なければキャッシュ）
  if (url.pathname.includes("/cards/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // その他：キャッシュ優先
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
