const C='v2';self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||e.request.url.includes('supabase'))return;
e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)))});
