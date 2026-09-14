import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, lstatSync, writeFileSync} from 'node:fs';
import {dirname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync, gunzipSync} from 'node:zlib';
import {parseArgs} from 'node:util';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const json = data => JSON.stringify(data, null, 2) + '\n';
const hashedStatic = name => /^assets\/[^/]+-[A-Za-z0-9_-]{8}\.[a-z0-9.]+$/.test(name);

export function inside(path) {
  const result = resolve(root, path);
  let existing = result;
  while (!existsSync(existing)) existing = dirname(existing);
  if (result === root || !result.startsWith(root + sep) ||
      !(realpathSync(existing) === root || realpathSync(existing).startsWith(root + sep))) {
    throw new Error('Path must remain inside the project');
  }
  return result;
}

export function files(directory, prefix = '') {
  return readdirSync(directory, {withFileTypes: true}).sort((a,b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const name = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error('Symlink is not allowed: ' + name);
    if (entry.isDirectory()) return files(resolve(directory, entry.name), name + '/');
    if (!entry.isFile()) throw new Error('Expected regular file: ' + name);
    return [name];
  });
}

function write(base, name, contents) {
  const target = resolve(base, name);
  if (!target.startsWith(base + sep)) throw new Error('Unsafe file path');
  mkdirSync(dirname(target), {recursive: true});
  writeFileSync(target, contents);
}

export function prepare({site, output, project, bucket, retain}) {
  site = inside(site);
  output = inside(output);
  if (!/^[a-z0-9][a-z0-9-]{1,56}[a-z0-9]$/.test(project || '') ||
      !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket || '')) throw new Error('Explicit valid project and bucket names required');
  if (existsSync(output)) throw new Error('Output already exists; use a fresh directory');
  if (!existsSync(resolve(site, 'index.html'))) throw new Error('Expected a built site');
  if (lstatSync(site).isSymbolicLink()) throw new Error('Site must not be a symlink');
  const input = files(site);
  const assets = {};
  const staticFiles = {};
  const payloads = new Map();
  if (retain) {
    retain = inside(retain);
    const previous = verifyBundle(retain);
    Object.assign(assets, previous.assets);
    for (const asset of Object.values(assets)) {
      for (const type of ['identity', 'gzip']) payloads.set(asset[type].key, readFileSync(resolve(retain, 'objects', asset[type].key)));
    }
    for (const [name] of Object.entries(previous.staticFiles)) {
      // Preserve old hashed dependencies, while the current build owns HTML and docs.
      if (hashedStatic(name)) staticFiles[name] = readFileSync(resolve(retain, 'site', name));
    }
  }
  for (const name of input) {
    if (name.endsWith('.gz')) continue;
    if (['_worker.js', '_routes.json', '_headers', '_redirects', 'wrangler.json'].includes(name)) throw new Error('Reserved deployment file: ' + name);
    const data = readFileSync(resolve(site, name));
    if (/^assets\/[^/]+\.(json|glb)$/.test(name)) {
      const zipped = existsSync(resolve(site, name + '.gz'))
        ? readFileSync(resolve(site, name + '.gz')) : gzipSync(data, {level: 9});
      if (!gunzipSync(zipped).equals(data)) throw new Error('Invalid gzip: ' + name);
      const representations = {};
      for (const [type, body] of [['identity', data], ['gzip', zipped]]) {
        const hash = sha256(body);
        const key = `models/${hash}/${type}`;
        payloads.set(key, body);
        representations[type] = {key, bytes: body.length, sha256: hash};
      }
      const asset = {contentType: name.endsWith('.glb') ? 'model/gltf-binary' : 'application/json', ...representations};
      if (assets['/' + name] && assets['/' + name].identity.sha256 !== asset.identity.sha256) throw new Error('Existing resource URL changed content: ' + name);
      assets['/' + name] = asset;
      delete staticFiles[name];
    } else {
      if (data.length > 25 * 1024 * 1024) throw new Error('Pages static file exceeds 25 MiB: ' + name);
      if (staticFiles[name] && !staticFiles[name].equals(data)) throw new Error('Retained asset changed content: ' + name);
      staticFiles[name] = data;
    }
  }
  const routes = Object.keys(assets).sort();
  if (!routes.length || routes.length > 100 || routes.some(route => route.length > 100 || /[?*#%\\]/.test(route))) {
    throw new Error('Model paths exceed Pages exact routing limits');
  }
  mkdirSync(output, {recursive: true});
  for (const [name, data] of Object.entries(staticFiles)) write(output, 'site/' + name, data);
  for (const [name, data] of payloads) write(output, 'objects/' + name, data);
  write(output, 'site/_worker.js/index.js', `import {createAssetWorker} from './asset-worker.mjs';\nexport default createAssetWorker(${JSON.stringify(assets)});\n`);
  write(output, 'site/_worker.js/asset-worker.mjs', readFileSync(new URL('./asset-worker.mjs', import.meta.url)));
  write(output, 'site/_routes.json', json({version: 1, include: routes, exclude: []}));
  // Only content-addressed files are immutable; fixed-name public assets revalidate.
  if (Object.keys(staticFiles).length >= 100) throw new Error('Retained static files exceed Pages header rule limit');
  write(output, 'site/_headers', '/\n  Cache-Control: no-cache\n' + Object.keys(staticFiles)
    .map(name => '/' + name + '\n  Cache-Control: ' + (hashedStatic(name) ? 'public, max-age=31536000, immutable' : 'no-cache') + '\n').join(''));
  write(output, 'wrangler.json', json({name: project, pages_build_output_dir: './site', compatibility_date: '2026-09-01',
    r2_buckets: [{binding: 'MODELS', bucket_name: bucket, preview_bucket_name: bucket}]}));
  const manifest = {schemaVersion: 1, project, bucket, assets,
    sourceFiles: Object.fromEntries(input.filter(n => !n.endsWith('.gz')).map(n => [n, sha256(readFileSync(resolve(site, n)))])),
    staticFiles: Object.fromEntries(Object.entries(staticFiles).map(([n, body]) => [n, sha256(body)])),
    files: Object.fromEntries(files(output).map(n => [n, sha256(readFileSync(resolve(output, n)))]))};
  write(output, 'bundle.json', json(manifest));
  verifyBundle(output);
  return manifest;
}

export function verifyBundle(directory) {
  directory = inside(directory);
  const manifest = JSON.parse(readFileSync(resolve(directory, 'bundle.json')));
  if (manifest.schemaVersion !== 1) throw new Error('Unknown deployment bundle');
  const actual = files(directory).filter(n => n !== 'bundle.json').sort();
  if (JSON.stringify(actual) !== JSON.stringify(Object.keys(manifest.files).sort())) throw new Error('Unexpected or missing bundle files');
  for (const name of actual) {
    if (sha256(readFileSync(resolve(directory, name))) !== manifest.files[name]) throw new Error('Bundle checksum mismatch: ' + name);
  }
  const config = JSON.parse(readFileSync(resolve(directory, 'wrangler.json')));
  if (config.name !== manifest.project || config.r2_buckets[0].bucket_name !== manifest.bucket) throw new Error('Bundle target mismatch');
  const routes = JSON.parse(readFileSync(resolve(directory,'site/_routes.json')));
  if (JSON.stringify(routes.include) !== JSON.stringify(Object.keys(manifest.assets).sort())) throw new Error('Bundle route mismatch');
  for (const asset of Object.values(manifest.assets)) for (const encoding of ['identity','gzip']) {
    const item = asset[encoding];
    if (!/^[a-f0-9]{64}$/.test(item.sha256) || item.key !== `models/${item.sha256}/${encoding}` ||
        manifest.files['objects/' + item.key] !== item.sha256 ||
        lstatSync(resolve(directory,'objects',item.key)).size !== item.bytes) throw new Error('Bundle object metadata mismatch');
  }
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {site: {type:'string'}, output: {type:'string'}, project: {type:'string'}, bucket: {type:'string'}, retain: {type:'string'}}});
  const result = prepare(values);
  console.log(json({project: result.project, bucket: result.bucket, modelPaths: Object.keys(result.assets).length, staticFiles: Object.keys(result.staticFiles).length}));
}
