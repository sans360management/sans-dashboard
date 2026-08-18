#!/usr/bin/env python3
"""
把 index.html 打包成单一档案（CSS / JS / 图片全部内嵌）。

用途：预览、转发、或整段贴进 GHL 的 Custom Code element。

    cd anniversary-26
    python3 build-single.py            # 产生 dist/index.html
    python3 build-single.py --no-img   # 不内嵌图片（图片改用绝对网址时用这个）
"""

import base64
import mimetypes
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
OUT_DIR = ROOT / 'dist'
EMBED_IMAGES = '--no-img' not in sys.argv


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


def data_uri(rel):
    path = ROOT / rel
    if not path.is_file():
        return None
    mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    return 'data:%s;base64,%s' % (mime, base64.b64encode(path.read_bytes()).decode())


def build():
    html = read('index.html')

    # 内嵌 CSS
    html = html.replace(
        '<link rel="stylesheet" href="assets/styles.css">',
        '<style>\n%s\n</style>' % read('assets/styles.css'),
    )

    # 内嵌 JS（维持原本载入顺序）
    html, n_js = re.subn(
        r'<script src="(assets/[^"]+)"></script>',
        lambda m: '<script>\n%s\n</script>' % read(m.group(1)),
        html,
    )

    # 内嵌图片：把 config.js 里的相对路径换成 data URI
    n_img = 0
    if EMBED_IMAGES:
        for rel in re.findall(r"'(assets/img/[^']+)'", html):
            uri = data_uri(rel)
            if uri:
                html = html.replace("'%s'" % rel, "'%s'" % uri)
                n_img += 1

    OUT_DIR.mkdir(exist_ok=True)
    target = OUT_DIR / 'index.html'
    target.write_text(html, encoding='utf-8')

    print('→ %s' % target)
    print('   内嵌 CSS 1 份、JS %d 份、图片 %d 张、共 %d KB'
          % (n_js, n_img, len(html.encode('utf-8')) // 1024))

    missing = [rel for rel in re.findall(r"'(assets/img/[^']+)'", read('assets/config.js'))
               if not (ROOT / rel).is_file()]
    if missing:
        print('   ⚠️  还没放的图片：%s（页面会 fallback，不会破版）' % ', '.join(missing))


if __name__ == '__main__':
    build()
