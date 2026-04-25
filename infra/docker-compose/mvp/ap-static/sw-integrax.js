// IntegraX service worker: patches GET /api/v1/projects to return the
// tenant-specific project so AP's frontend access guard passes.
//
// The active projectId is stored in the Cache API by auto-login.html.
// This SW is registered from auto-login.html, installed with skipWaiting
// so it takes control before the AP SPA loads.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Only intercept the list endpoint (exact path, no /id suffix)
  if (url.pathname === '/api/v1/projects' && event.request.method === 'GET') {
    event.respondWith(interceptProjectsList(event.request));
  }
});

async function interceptProjectsList(request) {
  try {
    const cache = await caches.open('integrax-config');
    const stored = await cache.match('/__integrax_project');
    if (!stored) return fetch(request);

    const projectId = (await stored.text()).trim();
    if (!projectId) return fetch(request);

    // Fetch the specific project using the admin token from the original request
    const projectRes = await fetch(
      new Request(`/api/v1/projects/${projectId}`, { headers: request.headers }),
    );
    if (!projectRes.ok) return fetch(request);

    const project = await projectRes.json();
    return new Response(JSON.stringify({ data: [project], next: null, previous: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return fetch(request);
  }
}
