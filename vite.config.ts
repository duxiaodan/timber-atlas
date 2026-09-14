import { defineConfig } from 'vite';
import {loadingAssets} from './scripts/lib/loading-assets.ts';
export default defineConfig({
  plugins:[loadingAssets()],
  cacheDir: '.cache/vite-timber',
  server: { host: '127.0.0.1', port: 4173, strictPort: true, watch: { ignored: ['**/.cache/**','**/.tools/**','**/.venv/**','**/.beads/**','**/.agents/**','**/docs/**','**/artifacts/**'] } },
  build: { target: 'es2022' },
});
