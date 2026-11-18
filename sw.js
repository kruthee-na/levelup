/* LevelUp service worker — เก็บหน้าแอปไว้ในเครื่องเพื่อเปิดได้เร็วและเปิดได้แม้ออฟไลน์
 * ข้อมูลคะแนน/การส่งงานไม่ถูกเก็บในแคช: คำขอไปยัง Apps Script (POST) วิ่งตรงถึงเซิร์ฟเวอร์เสมอ */
const VERSION = 'c00329ab07';
const CACHE = 'levelup-' + VERSION;
const SHELL = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const CDN = [
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll(SHELL).then(() =>
        // ไลบรารีจาก CDN โหลดไม่ได้ก็ยังติดตั้งได้ จะถูกเก็บตอนใช้งานครั้งแรกแทน
        Promise.all(CDN.map(url => cache.add(url).catch(() => null)))
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.indexOf('levelup-') === 0 && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(request, fallbackKey) {
  return fetch(request).then(response => {
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(fallbackKey || request, copy));
    }
    return response;
  }).catch(() => caches.match(fallbackKey || request).then(hit => hit || Response.error()));
}

function cacheFirst(request) {
  return caches.match(request).then(hit => {
    const refresh = fetch(request).then(response => {
      if (response && (response.ok || response.type === 'opaque')) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    });
    if (hit) { refresh.catch(() => null); return hit; }
    return refresh;
  });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;                       // API ของ Apps Script: ไม่แตะ
  const url = new URL(request.url);
  if (/(^|\.)google\.com$|googleusercontent\.com$/.test(url.hostname)) return;   // ข้อมูลและไฟล์จาก Google: ไม่เก็บ
  if (url.origin === self.location.origin) {
    // หน้าแอปและไฟล์ของแอป: เอาของใหม่จากเครือข่ายก่อน ออฟไลน์จึงใช้ที่เก็บไว้
    event.respondWith(request.mode === 'navigate' ? networkFirst(request, './') : networkFirst(request));
    return;
  }
  if (/^(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
});
