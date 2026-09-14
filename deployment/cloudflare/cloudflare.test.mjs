import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createAssetWorker} from './asset-worker.mjs';
import {prepare, verifyBundle, root} from './prepare.mjs';

function fixture(t) {
  mkdirSync(resolve(root, '.cache/tmp'), {recursive:true});
  const base = mkdtempSync(resolve(root, '.cache/tmp/cloudflare-test-'));
  t.after(() => rmSync(base, {recursive:true, force:true}));
  const site = resolve(base, 'input');
  mkdirSync(resolve(site, 'assets'), {recursive:true});
  mkdirSync(resolve(site, 'assets/credits'), {recursive:true});
  writeFileSync(resolve(site, 'assets/credits/source.json'), '{"credit":"fixture"}');
  writeFileSync(resolve(site, 'index.html'), '<html>fixture</html>');
  writeFileSync(resolve(site, 'assets/app-12345678.js'), 'export default 1');
  writeFileSync(resolve(site, 'assets/model-hash.json'), '{"model":[1,2,3]}');
  const output = resolve(base, 'bundle');
  const manifest = prepare({site, output, project:'test-pages', bucket:'test-models'});
  return {base, site, output, manifest};
}

test('split deployment preserves bytes, excludes models from static, and retains old dependencies', t => {
  const {base, site, output, manifest} = fixture(t);
  assert.equal(existsSync(resolve(output, 'site/assets/model-hash.json')), false);
  assert.equal(readFileSync(resolve(output,'site/assets/credits/source.json'),'utf8'), '{"credit":"fixture"}');
  assert.equal(Object.keys(manifest.assets).length,1);
  assert.equal(readFileSync(resolve(output, 'site/index.html'), 'utf8'), '<html>fixture</html>');
  const asset = manifest.assets['/assets/model-hash.json'];
  assert.deepEqual(gunzipSync(readFileSync(resolve(output, 'objects', asset.gzip.key))), readFileSync(resolve(site, 'assets/model-hash.json')));
  assert.deepEqual(JSON.parse(readFileSync(resolve(output, 'site/_routes.json'))).include, ['/assets/model-hash.json']);
  rmSync(resolve(site, 'assets/model-hash.json'));
  rmSync(resolve(site, 'assets/app-12345678.js'));
  writeFileSync(resolve(site, 'assets/model-new.json'), '{}');
  const next = prepare({site, output:resolve(base,'next'), retain:output, project:'test-pages', bucket:'test-models'});
  assert.equal(Object.keys(next.assets).length, 2);
  assert.ok(next.staticFiles['assets/app-12345678.js']);
  writeFileSync(resolve(output, 'site/index.html'), 'tampered');
  assert.throws(() => verifyBundle(output), /checksum/);
});

test('Function negotiates gzip, keeps static requests local, and handles conditional/HEAD/failures', async t => {
  const {output, manifest} = fixture(t);
  const worker = createAssetWorker(manifest.assets);
  let reads = 0;
  const env = {ASSETS: {fetch: () => new Response('static')}, MODELS: {
    get: async key => { reads++; const bytes = readFileSync(resolve(output, 'objects', key)); return {size:bytes.length, body:bytes}; },
    head: async key => ({size:readFileSync(resolve(output, 'objects', key)).length}),
  }};
  const request = (headers = {}, method = 'GET', path = '/assets/model-hash.json') =>
    worker.fetch(new Request('https://example.com' + path, {headers, method}), env, {waitUntil(){}});
  const compressed = await request({'Accept-Encoding':'gzip'});
  assert.equal(compressed.headers.get('Content-Encoding'), 'gzip');
  assert.equal(gunzipSync(Buffer.from(await compressed.arrayBuffer())).toString(), '{"model":[1,2,3]}');
  assert.equal((await request({'Accept-Encoding':'gzip;q=0, identity;q=1'})).headers.has('Content-Encoding'), false);
  assert.equal((await request({'Accept-Encoding':'identity;q=0, *;q=0'})).status, 406);
  assert.equal((await request({'Accept-Encoding':'gzip', 'If-None-Match':'W/' + compressed.headers.get('ETag')})).status, 304);
  assert.equal((await request({}, 'HEAD')).body, null);
  assert.equal((await request({}, 'POST')).status, 405);
  assert.equal((await request({Range:'bytes=1-2'})).status, 200);
  const before = reads;
  assert.equal(await (await request({}, 'GET', '/assets/app-12345678.js')).text(), 'static');
  assert.equal(reads, before);
  env.MODELS.get = async () => null;
  const failed = await request();
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('Cache-Control'), 'no-store');
  env.MODELS.get = async () => {throw new Error('internal details');};
  assert.equal(await (await request()).text(), 'Model temporarily unavailable');
});

test('preparation rejects overwritten output, corrupt gzip and oversized static files', t => {
  const {base, site, output} = fixture(t);
  const options = {site, output, project:'test-pages', bucket:'test-models'};
  assert.throws(() => prepare(options), /already exists/);
  writeFileSync(resolve(site, 'assets/model-hash.json.gz'), 'not gzip');
  assert.throws(() => prepare({...options, output:resolve(base, 'corrupt')}));
  rmSync(resolve(site, 'assets/model-hash.json.gz'));
  writeFileSync(resolve(site, 'assets/large.bin'), Buffer.alloc(25 * 1024 * 1024 + 1));
  assert.throws(() => prepare({...options, output:resolve(base, 'large')}), /25 MiB/);
});

test('cache separates representations, ignores query strings, and never caches missing objects', async t => {
  const {output, manifest} = fixture(t);
  const previous = globalThis.caches;
  const entries = new Map();
  const pending = [];
  globalThis.caches = {default: {
    match: async key => entries.get(key.url)?.clone(),
    put: async (key, response) => {entries.set(key.url, response);},
  }};
  t.after(() => {if (previous === undefined) delete globalThis.caches; else globalThis.caches = previous;});
  let reads = 0, missing = true;
  const worker = createAssetWorker(manifest.assets);
  const env = {MODELS:{get:async key => {
    reads++;
    if (missing) return null;
    const bytes = readFileSync(resolve(output,'objects',key));
    return {body:bytes, size:bytes.length};
  }}};
  const request = async (query, encoding) => {
    const response = await worker.fetch(new Request('https://example.com/assets/model-hash.json' + query,
      {headers:{'Accept-Encoding':encoding}}),env,{waitUntil:p => pending.push(p)});
    await response.arrayBuffer(); await Promise.all(pending);
    return response;
  };
  assert.equal((await request('', 'gzip')).status,503);
  assert.equal(entries.size,0);
  missing = false;
  assert.equal((await request('', 'gzip')).status,200);
  const before = reads;
  assert.equal((await request('?retry=1', 'gzip')).status,200);
  assert.equal(reads,before);
  assert.equal((await request('', 'identity')).headers.has('Content-Encoding'),false);
  assert.equal(reads,before+1);
  assert.equal(entries.size,2);
});
