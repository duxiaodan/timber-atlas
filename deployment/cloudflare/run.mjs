import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {parseArgs} from 'node:util';
import {inside, root, sha256, verifyBundle} from './prepare.mjs';

// Keep Wrangler logs/config/state local for every deployment invocation.
export function localEnvironment() {
  const cache = inside('.cache/cloudflare');
  for (const part of ['config', 'logs', 'tmp']) mkdirSync(resolve(cache, part), {recursive: true});
  return {...process.env, XDG_CONFIG_HOME: resolve(cache, 'config'),
    XDG_CACHE_HOME: cache, TMPDIR: resolve(cache, 'tmp'), WRANGLER_LOG_PATH: resolve(cache, 'logs'),
    WRANGLER_SEND_METRICS: 'false', CI: 'true'};
}

export function wrangler(args, env = localEnvironment(), cwd = root) {
  const child = spawn(process.execPath, [resolve(root, 'node_modules/wrangler/bin/wrangler.js'), ...args], {cwd, env, stdio: 'inherit'});
  return new Promise((accept, reject) => {
    child.on('error', reject);
    child.on('exit', code => code === 0 ? accept() : reject(new Error('Wrangler exited with code ' + code)));
  });
}

function executionDirectory(bundle) {
  const config = JSON.parse(readFileSync(resolve(bundle, 'wrangler.json')));
  config.pages_build_output_dir = resolve(bundle, 'site');
  const directory = inside('.cache/cloudflare/projects/' + sha256(JSON.stringify(config)));
  mkdirSync(directory, {recursive:true});
  writeFileSync(resolve(directory,'wrangler.json'), JSON.stringify(config));
  return directory;
}

export async function seedLocal(bundle, state) {
  const manifest = verifyBundle(bundle);
  Object.assign(process.env, localEnvironment());
  const {getPlatformProxy} = await import('wrangler');
  const proxy = await getPlatformProxy({configPath: resolve(bundle, 'wrangler.json'),
    persist: {path: resolve(state, 'v3')}, remoteBindings: false, envFiles: []});
  try {
    for (const asset of Object.values(manifest.assets)) {
      for (const encoding of ['identity', 'gzip']) {
        const item = asset[encoding];
        await proxy.env.MODELS.put(item.key, readFileSync(resolve(bundle, 'objects', item.key)), {
          httpMetadata: {contentType: asset.contentType, ...(encoding === 'gzip' ? {contentEncoding: 'gzip'} : {})},
        });
        const saved = await proxy.env.MODELS.get(item.key);
        if (!saved || sha256(Buffer.from(await saved.arrayBuffer())) !== item.sha256) throw new Error('Local R2 verification failed');
      }
    }
  } finally { await proxy.dispose(); }
}

export async function upload(bundle, env = process.env) {
  const manifest = verifyBundle(bundle);
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  if (!/^[a-f0-9]{32}$/i.test(account || '') || !env.CLOUDFLARE_API_TOKEN) throw new Error('Cloudflare account ID and API token required');
  const base = `https://api.cloudflare.com/client/v4/accounts/${account}`;
  const headers = {Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`};
  const request = (path, options = {}) => fetch(base + path, {
    ...options, headers: {...headers, ...options.headers}, signal: AbortSignal.timeout(120000), redirect: 'error',
  });
  for (const path of [`/r2/buckets/${manifest.bucket}`, `/pages/projects/${manifest.project}`]) {
    const response = await request(path);
    if (!response.ok || !(await response.json()).success) throw new Error('Cloudflare bucket/project preflight failed: HTTP ' + response.status);
  }
  // Store compressed bytes as octet-stream here. The Function owns response
  // metadata, so management GETs stay byte-exact without automatic decompression.
  for (const asset of Object.values(manifest.assets)) {
    for (const encoding of ['identity', 'gzip']) {
      const item = asset[encoding];
      const path = `/r2/buckets/${manifest.bucket}/objects/${item.key}`;
      let response = await request(path);
      if (response.status === 404) {
        await response.arrayBuffer();
        const put = await request(path, {method: 'PUT', body: readFileSync(resolve(bundle, 'objects', item.key)),
          headers: {'Content-Type': 'application/octet-stream', 'cf-r2-storage-class': 'Standard'}});
        if (!put.ok) throw new Error('R2 upload failed: HTTP ' + put.status);
        await put.arrayBuffer();
        response = await request(path);
      }
      if (!response.ok || sha256(Buffer.from(await response.arrayBuffer())) !== item.sha256) {
        throw new Error('R2 object checksum mismatch or read failure; publication stopped');
      }
    }
  }
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {bundle: {type:'string'}, action: {type:'string'}, state: {type:'string'}, port: {type:'string'}, branch: {type:'string'}}});
  const bundle = inside(values.bundle);
  const state = inside(values.state || '.cache/cloudflare-state');
  const manifest = verifyBundle(bundle);
  if (values.action === 'seed-local') await seedLocal(bundle, state);
  else if (values.action === 'dev') {
    await wrangler(['pages', 'dev', '--persist-to', state,
      '--r2', 'MODELS=' + manifest.bucket,
      '--ip', '127.0.0.1', '--port', values.port || '4180'], localEnvironment(), executionDirectory(bundle));
  } else if (values.action === 'upload' || values.action === 'deploy') {
    if (values.action === 'deploy' && !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(values.branch || '')) throw new Error('Explicit deployment branch required');
    await upload(bundle);
    if (values.action === 'deploy') await wrangler(['pages', 'deploy',
      '--project-name', manifest.project, '--branch', values.branch], localEnvironment(), executionDirectory(bundle));
  } else throw new Error('Action must be seed-local, dev, upload or deploy');
}
