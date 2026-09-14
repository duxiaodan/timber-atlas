# Cloudflare Pages and R2

[中文](#中文)

Local development keeps using `npm run dev` and local model files. This optional deployment adapter serves the same asset URLs from R2 through a Pages Function. No Cloudflare credentials are needed to build or develop the application.

Build the application, then prepare a separate deployment bundle (use a new output directory each time):

```sh
npm ci
npm run build
npm run test:cloudflare
npm run cloudflare:prepare -- --site dist --output .cache/cloudflare/release-1 --project YOUR-PAGES-PROJECT --bucket YOUR-R2-BUCKET
```

Preparation copies static files and extracts `assets/*.json` and `assets/*.glb` model data into R2 objects. Original and precompressed gzip representations have full SHA-256 keys. The bundle contains checksums, exact Function routes and a Wrangler configuration. No model is removed from `dist`.

To retain older resource URLs for open tabs, pass `--retain .cache/cloudflare/previous-release`. The prior bundle must remain intact. Preparation checks the Pages limits (25 MiB per static file, 100 exact routes, 100 characters per route). If retained versions exceed routing limits, plan a retention change before publishing; no automatic deletion occurs.

Test the Cloudflare runtime locally without an account:

```sh
npm run cloudflare:run -- --action seed-local --bundle .cache/cloudflare/release-1
npm run cloudflare:run -- --action dev --bundle .cache/cloudflare/release-1 --port 4180
```

Open `http://127.0.0.1:4180/`. The emulator is separate from ordinary Vite development. Local caches, logs and R2 data stay under `.cache/`.

For online deployment, first create a private R2 Standard bucket and a Pages Direct Upload project with the names used above. Enable R2 on your account. Provide `CLOUDFLARE_ACCOUNT_ID` and an account-scoped `CLOUDFLARE_API_TOKEN` with Cloudflare Pages Edit and Workers R2 Storage Edit via the environment. Never put these credentials in the public bundle or version control.

```sh
npm run cloudflare:run -- --action deploy --bundle .cache/cloudflare/release-1 --branch preview
```

The command verifies the prepared bundle and remote project/bucket, uploads missing objects and checks their SHA-256 by reading them back. It refuses conflicting existing content. Only then does it upload Pages. `--action upload` performs just the object phase. The explicit branch determines preview versus production according to the Pages project's production branch. Use an isolated test project first.

Model responses support gzip/identity, GET/HEAD and ETag revalidation. Range requests receive complete responses. Missing objects return a retryable, noncached 503. The Function streams bodies and uses a representation-specific Cache API key. Static files bypass it via `_routes.json`; cache hits within the Function still count as Function requests. Keep old objects and bundles to roll back by redeploying a previous bundle. Do not configure automatic object expiry while versions still refer to them.

R2 egress is free, while storage, operations and Function execution have quotas and possible charges. Local tests do not establish production CDN behavior, billing or regional performance. Verify decoded file hashes, loading progress, failure/retry behavior and actual usage on the test site before attaching a custom domain. For an externally managed DNS subdomain, associate it with Pages first and then add its CNAME.

## 中文

日常 `npm run dev` 与 SSH 测试继续读取本地模型，不需要 Cloudflare 账号。上述命令仅在部署时分离模型文件：静态页面交给 Pages，大型 JSON／GLB 通过同域名原路径从 R2 提供。构建目录中的本地模型始终保留。

每次用新的输出目录准备部署包；`--retain` 保留上次部署的旧哈希资源，支持已打开的页面与回退。部署包检查静态文件大小、路由限制及文件散列；超出限制时停止，不自动删除旧资源。

`seed-local` 与 `dev` 启动本地 Cloudflare 模拟环境。线上部署需先开通 R2、建立私有 Standard 桶与 Pages Direct Upload 项目，并通过环境提供限账号的 Pages／R2 编辑 Token。`deploy` 在上传及回读核对全部对象后才发布页面；分支参数显式区分测试与正式发布。优先使用独立测试项目。

两种压缩表示使用各自的完整 SHA-256 键，支持 GET／HEAD、ETag 与长缓存。缺失模型返回可重试的 503；Range 返回完整内容。Function 内的缓存命中仍计函数请求，本地模拟不代表线上缓存、费用或地区性能已验证。保留旧部署包及 R2 对象，可通过重新部署旧包回退。正式域名在测试通过后接入；外部 DNS 子域先关联 Pages，再添加 CNAME。

References: [Pages configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/), [R2 bindings](https://developers.cloudflare.com/pages/functions/bindings/), [pricing](https://developers.cloudflare.com/r2/pricing/).
