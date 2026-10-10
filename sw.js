// ---------- Push notifications (Firebase Cloud Messaging) ----------
// Notification එකක් click කළාම app එක open කරනවා (හෝ දැනටමත් open නම් focus කරනවා).
// මේක Firebase SDK එකට කලින් register කරන්නේ, SDK එකේ default click handler
// එක (site root එක open කරන) වෙනුවට මේක ක්‍රියාත්මක වෙන්නයි.
self.addEventListener('notificationclick', (event) => {
  event.stopImmediatePropagation();
  event.notification.close();
  const fcm = (event.notification.data && event.notification.data.FCM_MSG) || {};
  const link = (fcm.fcmOptions && fcm.fcmOptions.link) || (fcm.notification && fcm.notification.click_action) || './index.html';
  const target = new URL(link, self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});

// ---------- ලැබෙන notification app එක ඇතුළේ save කිරීම (IndexedDB) ----------
// Notification එකක් ආවම (app close කරලා තිබුණත්) මෙතන save වෙනවා.
// App එකේ "දැනුම්දීම්" panel එක ඒ ටික කියවලා පෙන්නනවා. අන්තිම 50 විතරයි තියාගන්නේ.
function swlOpenDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('swl-notifs', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('items', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function swlSaveNotif(item) {
  const db = await swlOpenDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('items', 'readwrite');
    const store = tx.objectStore('items');
    store.put(item);
    const all = store.getAll();
    all.onsuccess = () => {
      all.result.sort((a, b) => b.t - a.t).slice(50).forEach((r) => store.delete(r.id));
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  const list = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  list.forEach((c) => c.postMessage({ type: 'swl-notif-saved' }));
}

self.addEventListener('push', (event) => {
  let d = null;
  try { d = event.data ? event.data.json() : null; } catch (e) { d = null; }
  if (!d) return;
  const n = d.notification || d.data || {};
  const title = n.title || '';
  const body = n.body || n.text || '';
  if (!title && !body) return;
  const id = d.fcmMessageId || ('n' + Date.now() + Math.random().toString(36).slice(2, 6));
  event.waitUntil(
    swlSaveNotif({ id, title, body, image: n.image || '', t: Date.now() }).catch(() => {})
  );
});

try {
  importScripts(
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js'
  );
  firebase.initializeApp({
    apiKey: 'AIzaSyDr8uJmUn8g-BB1BzQtkBpts6Ng7yOAPAg',
    authDomain: 'science-with-lakmal.firebaseapp.com',
    projectId: 'science-with-lakmal',
    storageBucket: 'science-with-lakmal.firebasestorage.app',
    messagingSenderId: '507509774337',
    appId: '1:507509774337:web:3c882f09c7c7ded7080800'
  });
  // Background (app close කරලා) තියෙද්දී එන notification FCM SDK එක ඉබේම පෙන්නනවා.
  firebase.messaging();
} catch (e) {
  // Offline නම් push කොටස skip වෙනවා; app එකේ අනිත් දේවල් සාමාන්‍ය විදියට වැඩ කරනවා.
}

const CACHE_NAME = 'swl-app-cache-v5';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Network-first: always try to get the latest version from the internet.
// Only fall back to the saved (cached) copy if the person is offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
