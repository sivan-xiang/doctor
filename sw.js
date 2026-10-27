/* 家庭医药助手 · Service Worker
 * 离线优先的「应用外壳」缓存：断网也能打开，联网时优先取最新内容。
 * 注意：内容更新发布后，请把下面的 CACHE 版本号 +1（如 fm-shell-v1 → v2），
 * 否则用户可能看到旧的缓存页面。
 */
var CACHE = 'fm-shell-v1';
var SHELL = [
  './',
  'assets/styles.css',
  'assets/app.js',
  'assets/content-data.js',
  'assets/icon.svg',
  'manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(SHELL).catch(function () { /* 个别资源失败不阻塞安装 */ });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 只处理同源资源

  // 页面导航：网络优先，失败回退缓存（保证在线拿到最新内容，离线仍可打开）
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./', copy); });
        return res;
      }).catch(function () {
        return caches.match('./').then(function (r) { return r || caches.match('assets/content-data.js'); });
      })
    );
    return;
  }

  // 静态资源：缓存优先，缺失时回源并补缓存
  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
