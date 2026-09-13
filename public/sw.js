const CACHE='canteen-shell-v4';
// Menu/logo/avatar images live in their own cache store, independent of the
// app-shell cache above — bumping CACHE on a redeploy must never evict
// already-downloaded menu images, and this name is not versioned in lockstep
// with app.js/app.css. Every upload writes a brand-new randomly-named file
// (menu-<id>-<hex>.webp etc.), so a URL that's already in this cache is
// content-immutable by construction and safe to serve forever without
// revalidation; a replaced image simply arrives under a different URL.
const MEDIA_CACHE='canteen-media-v1';
const SHELL=['/','/assets/app.js','/assets/app.css','/manifest.webmanifest','/icons/icon-192.png','/icons/logo.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k!==MEDIA_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.origin!==location.origin)return;
  // Menu/logo/avatar images are served as /?media=<versioned-filename>.webp.
  // Cache-first here is safe (see MEDIA_CACHE comment above) and is what
  // makes a second Menu visit, or reopening the installed PWA, show
  // already-seen images instantly instead of waiting on the network.
  if(u.pathname==='/'&&u.searchParams.has('media')){
    e.respondWith(caches.open(MEDIA_CACHE).then(cache=>cache.match(e.request).then(cached=>cached||fetch(e.request).then(resp=>{if(resp.ok)cache.put(e.request,resp.clone());return resp;}))));
    return;
  }
  // Static app-icon/branding files (the sidebar logo, PWA icons) are
  // build-versioned assets, not business data — they only ever change on a
  // code deploy, never per-request. Without this branch they fell through
  // to the network-first handler below, which forces cache:'no-cache' on
  // every request; since every module switch in this app is a full page
  // navigation, that meant the sidebar logo was silently re-fetched over
  // the network on every single click, producing a visible flash/re-render
  // right where the rest of the (already-parsed) shell HTML painted
  // instantly. Cache-first here removes that round trip entirely.
  if(u.pathname.startsWith('/icons/')){
    e.respondWith(caches.open(CACHE).then(cache=>cache.match(e.request).then(cached=>cached||fetch(e.request).then(resp=>{if(resp.ok)cache.put(e.request,resp.clone());return resp;}))));
    return;
  }
  // The document itself (/) and every other route (API/page data such as
  // /orders, /reports, /menu) are intentionally left out of any cache here —
  // only /assets/* build output is cached below, network-first, so billing
  // and menu data always come fresh from the server.
  if(u.pathname==='/')return;
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{if(r.ok&&u.pathname.startsWith('/assets/')){const copy=r.clone();caches.open(CACHE).then(x=>x.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));
});
