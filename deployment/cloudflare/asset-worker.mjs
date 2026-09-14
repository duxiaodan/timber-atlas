// The manifest is generated from a built site; requests never become arbitrary R2 keys.
function encodingQuality(header, name) {
  const values = new Map((header || '').toLowerCase().split(',').map(part => {
    const [encoding, ...parameters] = part.trim().split(';');
    const quality = parameters.find(p => p.trim().startsWith('q='));
    const q = quality ? Number(quality.trim().slice(2)) : 1;
    return [encoding, Number.isFinite(q) && q >= 0 && q <= 1 ? q : 0];
  }));
  if (values.has(name)) return values.get(name);
  if (name === 'identity') return values.get('*') === 0 ? 0 : 1;
  return values.get('*') ?? 0;
}

function failure(status, message) {
  return new Response(message, {status, headers: {
    'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8',
    ...(status === 503 ? {'Retry-After': '5'} : {}),
  }});
}

export function createAssetWorker(assets) {
  return {async fetch(request, env, context) {
    const url = new URL(request.url);
    const asset = Object.hasOwn(assets, url.pathname) ? assets[url.pathname] : null;
    if (!asset) return env.ASSETS.fetch(request);
    if (!['GET', 'HEAD'].includes(request.method)) {
      const response = failure(405, 'Method not allowed');
      response.headers.set('Allow', 'GET, HEAD');
      return response;
    }
    // Cloudflare normalizes Accept-Encoding before invoking a Worker.
    const accept = request.cf?.clientAcceptEncoding ?? request.headers.get('Accept-Encoding');
    const gzip = encodingQuality(accept, 'gzip');
    const identity = encodingQuality(accept, 'identity');
    const encoding = gzip > 0 && gzip >= identity ? 'gzip' : 'identity';
    if (gzip === 0 && identity === 0) return failure(406, 'No acceptable representation');
    const object = asset[encoding];
    const headers = new Headers({
      'Content-Type': asset.contentType,
      'Content-Length': String(object.bytes),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': `"${object.sha256}"`,
      'Vary': 'Accept-Encoding',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'none',
    });
    if (encoding === 'gzip') headers.set('Content-Encoding', 'gzip');
    // A representation-specific key prevents gzip/identity cache collisions and
    // query strings cannot amplify the cache. Cache hits still invoke this Function.
    const cacheKey = new Request(`${url.origin}/__model-cache/${object.sha256}/${encoding}`);
    const cache = globalThis.caches?.default;
    let response;
    try {
      const cached = await cache?.match(cacheKey);
      headers.set('X-Model-Cache', cached ? 'HIT' : 'MISS');
      if (cached) response = new Response(cached.body, {headers, encodeBody:'manual'});
      else {
        const stored = request.method === 'HEAD'
          ? await env.MODELS.head(object.key) : await env.MODELS.get(object.key);
        if (!stored || stored.size !== object.bytes) return failure(503, 'Model temporarily unavailable');
        response = new Response(request.method === 'HEAD' ? null : stored.body, {
          headers, encodeBody: 'manual',
        });
        if (request.method === 'GET' && cache) {
          // Cache raw representation bytes without Content-Encoding. Otherwise
          // Cache API serialization can recompress an already-gzipped stream.
          const cacheResponse = new Response(response.clone().body, {encodeBody:'manual', headers:{
            'Content-Type':'application/octet-stream', 'Content-Length':String(object.bytes),
            'Cache-Control':headers.get('Cache-Control'),
          }});
          context.waitUntil(cache.put(cacheKey, cacheResponse).catch(() => {}));
        }
      }
    } catch {
      return failure(503, 'Model temporarily unavailable');
    }
    const condition = request.headers.get('If-None-Match');
    if (condition?.split(',').some(tag => tag.trim() === '*' ||
        tag.trim().replace(/^W\//, '') === headers.get('ETag'))) {
      await response.body?.cancel();
      headers.delete('Content-Length');
      return new Response(null, {status: 304, headers});
    }
    if (request.method === 'HEAD') {
      await response.body?.cancel();
      return new Response(null, {headers, encodeBody: 'manual'});
    }
    // Ignore Range: the loading client requests complete objects, including gzip.
    return response;
  }};
}
