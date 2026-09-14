#!/usr/bin/env python3
"""Serve the portable build, with project-local precompressed gzip assets."""
import argparse
import gzip
import os
import shutil
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

COMPRESSIBLE = {'.js', '.css', '.json', '.svg', '.html', '.wasm', '.glb'}
compression_lock = threading.Lock()


def accepts_gzip(value):
    qualities = {}
    for item in value.lower().split(','):
        coding, *parameters = item.strip().split(';')
        quality = 1.0
        for parameter in parameters:
            key, _, raw = parameter.strip().partition('=')
            if key == 'q':
                try:
                    quality = float(raw)
                except ValueError:
                    quality = 0.0
        qualities[coding] = quality
    return 0 < qualities.get('gzip', qualities.get('*', 0)) <= 1


def compressed_asset(path, site):
    """Reuse an atomic sidecar; regenerate once if a live build changed it."""
    path = path.resolve()
    try:
        path.relative_to(site.resolve())
    except ValueError:
        return None
    if path.suffix.lower() not in COMPRESSIBLE or not path.is_file():
        return None
    with compression_lock:
        source = path.stat()
        if source.st_size < 1024:
            return None
        target = path.with_name(path.name + '.gz')
        if target.is_symlink():
            return None
        if target.exists() and target.stat().st_mtime_ns == source.st_mtime_ns:
            return target if target.stat().st_size < source.st_size else None
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.gzip-', delete=False) as output:
                temporary = Path(output.name)
                with path.open('rb') as original, gzip.GzipFile(filename='', mode='wb', fileobj=output, compresslevel=6, mtime=0) as encoded:
                    shutil.copyfileobj(original, encoded)
            os.utime(temporary, ns=(source.st_atime_ns, source.st_mtime_ns))
            temporary.replace(target)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
        return target if target.stat().st_size < source.st_size else None


class Handler(SimpleHTTPRequestHandler):
    def send_head(self):
        self.gzip_path = None
        path = Path(super().translate_path(self.path))
        if path.is_dir():
            # Keep the standard directory redirect and index handling.
            if self.path.split('?', 1)[0].endswith('/'):
                path = path / 'index.html'
        if accepts_gzip(self.headers.get('Accept-Encoding', '')):
            self.gzip_path = compressed_asset(path, Path(self.directory))
        return super().send_head()

    def translate_path(self, path):
        return str(self.gzip_path) if getattr(self, 'gzip_path', None) else super().translate_path(path)

    def guess_type(self, path):
        return super().guess_type(path[:-3] if getattr(self, 'gzip_path', None) else path)

    def send_response(self, code, message=None):
        self.response_code = code
        super().send_response(code, message)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Vary', 'Accept-Encoding')
        if getattr(self, 'gzip_path', None) and self.response_code in (200, 304):
            self.send_header('Content-Encoding', 'gzip')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()


def main():
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description='木构图志 · Timber Atlas · 本机服务')
    parser.add_argument('--port', type=int, default=4173)
    parser.add_argument('--host', default='127.0.0.1', help='Bind address; use 0.0.0.0 to allow network access')
    parser.add_argument('--directory', type=Path, default=root / 'dist', help='Static build directory')
    args = parser.parse_args()
    site = args.directory.resolve()
    if not (site / 'index.html').is_file():
        parser.error(f'缺少 {site}/index.html，请先构建该目录。')
    for path in site.rglob('*'):
        if path.suffix.lower() in COMPRESSIBLE:
            compressed_asset(path, site)
    server = ThreadingHTTPServer((args.host, args.port), partial(Handler, directory=str(site)))
    print('木构图志 · Timber Atlas：http://%s:%d/ · gzip 已启用' % (args.host, args.port), flush=True)
    print('按 Ctrl+C 停止服务。', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
