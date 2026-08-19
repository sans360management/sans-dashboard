#!/usr/bin/env python3
"""
产生「可以整段贴进 GHL Custom Code 元素」的版本。

跟 build-single.py 的差别：
  1. 去掉 <!doctype>/<html>/<head>/<body> —— GHL 只吃片段
  2. 整页包进 <div id="sans26">，**所有 CSS 都限定在这个容器内**
     （不然 .card / .nav / .btn 这种通用类别会跟 GHL 编辑器本身的样式互相污染）
  3. 字型改用 @import（GHL 有时会滤掉 <link>）
  4. 自动解开外层容器的 overflow / transform，让吸顶导览列能正常运作

    python3 build-ghl.py              # 图片用 config.js 里的路径（建议先改成绝对网址）
    python3 build-ghl.py --embed-img  # 图片转 base64 内嵌（贴上去的内容会大很多）
"""

import base64
import mimetypes
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
OUT_DIR = ROOT / 'dist'
EMBED_IMAGES = '--embed-img' in sys.argv
SCOPE = '#sans26'
CLASS_NAMES = set()

FONTS = ("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700"
         "&family=Inter:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;600"
         "&family=Noto+Serif+SC:wght@600;700&display=swap")


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


# ----------------------------------------------------------------- 类别改名

PREFIX = 's26-'
CLASS_RE = re.compile(r'\.([A-Za-z_][\w-]*)')


def collect_classes(css):
    """从选择器（而不是属性值）里收集所有类别名。"""
    names = set()
    for prelude in re.findall(r'([^{}]*)\{', strip_comments(css)):
        head = prelude.strip()
        if head.startswith('@') or not head:
            continue
        names.update(CLASS_RE.findall(prelude))
    return names


def rename_in_selector(text, names):
    return CLASS_RE.sub(
        lambda m: '.' + PREFIX + m.group(1) if m.group(1) in names else m.group(0), text)


def rename_in_html(html, names):
    def repl(m):
        classes = ' '.join(PREFIX + c if c in names else c for c in m.group(1).split())
        return 'class="%s"' % classes
    return re.sub(r'class="([^"]*)"', repl, html)


def rename_in_js(js, names):
    """只改字串常值，避免动到 element.lang / el.className 这类属性存取。"""
    def fix(text):
        if '.' in text:                      # 像 '.field.has-error .err' 这种选择器
            return rename_in_selector(text, names)
        parts = re.split(r'(\s+)', text)      # 像 'is-in' 或 'form-status ' 这种类别名
        if any(p in names for p in parts) and all(p in names or not p.strip() for p in parts):
            return ''.join(PREFIX + p if p in names else p for p in parts)
        return text

    return re.sub(r"(['\"])((?:[^'\"\\\n]|\\.)*?)\1",
                  lambda m: m.group(1) + fix(m.group(2)) + m.group(1), js)


# ----------------------------------------------------------------- CSS 作用域

def strip_comments(css):
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)


def scope_selector(sel):
    sel = sel.strip()
    if not sel:
        return sel

    # html 的规则保持全域（scroll-behavior / scroll-padding 要作用在文件本身）
    if sel == 'html' or sel.startswith('html '):
        return sel

    # body 的规则移到容器上
    if sel == 'body':
        return SCOPE
    if sel.startswith('body'):
        return SCOPE + sel[len('body'):]

    if sel.startswith(':root'):
        return SCOPE + sel[len(':root'):]

    # 万用选择器：容器本身也要套用
    if sel == '*':
        return '%s, %s *' % (SCOPE, SCOPE)
    if sel.startswith('*'):
        return '%s %s' % (SCOPE, sel)

    if sel.startswith(SCOPE):
        return sel

    return '%s %s' % (SCOPE, sel)


def scope_css(css):
    """把每条规则的选择器前面加上容器，@media 递回处理，@keyframes 原样保留。"""
    out = []
    i, n = 0, len(css)

    while i < n:
        brace = css.find('{', i)
        if brace == -1:
            out.append(css[i:])
            break

        prelude = css[i:brace]

        # 找出这个区块的结尾（处理巢状）
        depth, j = 0, brace
        while j < n:
            if css[j] == '{':
                depth += 1
            elif css[j] == '}':
                depth -= 1
                if depth == 0:
                    break
            j += 1
        body = css[brace + 1:j]

        head = prelude.strip()
        if head.startswith(('@media', '@supports', '@container')):
            out.append('%s{%s}' % (prelude, scope_css(body)))
        elif head.startswith(('@keyframes', '@font-face', '@import', '@charset', '@page')):
            out.append('%s{%s}' % (prelude, body))
        else:
            prelude = rename_in_selector(prelude, CLASS_NAMES)
            selectors = ', '.join(scope_selector(s) for s in prelude.split(',') if s.strip())
            out.append('%s{%s}' % (selectors, body))

        i = j + 1

    return ''.join(out)


# ----------------------------------------------------------------- 组装

def data_uri(rel):
    path = ROOT / rel
    if not path.is_file():
        return None
    mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    return 'data:%s;base64,%s' % (mime, base64.b64encode(path.read_bytes()).decode())


UNLOCK = """
/* 吸顶导览列若被 GHL 的外层容器裁掉，往上解开 overflow / transform */
(function () {
  var el = document.getElementById('sans26');
  for (var p = el && el.parentElement; p && p !== document.body; p = p.parentElement) {
    var cs = getComputedStyle(p);
    if (cs.overflow !== 'visible') p.style.overflow = 'visible';
    if (cs.transform !== 'none') p.style.transform = 'none';
  }
})();
"""


def build():
    html = read('index.html')

    body = re.search(r'<body[^>]*>(.*)</body>', html, re.S).group(1)

    # 移除原本的外部档案引用，改成内嵌
    body = re.sub(r'<script src="assets/[^"]+"></script>\s*', '', body)
    body = body.replace('<link rel="stylesheet" href="assets/styles.css">', '')

    raw_css = strip_comments(read('assets/styles.css'))

    global CLASS_NAMES
    CLASS_NAMES = collect_classes(raw_css)

    css = scope_css(raw_css)
    body = rename_in_html(body, CLASS_NAMES)

    js = '\n'.join(read('assets/' + f) for f in ('config.js', 'i18n.js', 'app.js', 'form.js'))
    js = rename_in_js(js, CLASS_NAMES)
    js += UNLOCK
    js += "\n(function(){var y=document.getElementById('year');if(y)y.textContent=new Date().getFullYear();})();"

    # 原本 index.html 里那段设定年份的 inline script 已经包含在上面，移掉重复的
    body = re.sub(r'<script>document\.getElementById\(.year.\).*?</script>\s*', '', body, flags=re.S)

    # 图片网址独立成一小段放最前面，贴进 GHL 后可以直接在那里改，不用重新打包
    import json
    cfg_block = re.search(r'images:\s*\{(.*?)\n  \}', read('assets/config.js'), re.S)
    cfg_imgs = dict(re.findall(r"(\w+):\s*'([^']+)'", cfg_block.group(1) if cfg_block else ''))
    def img_literal(rel):
        """内嵌模式回传切成短行的 base64；否则回传网址字串。
           单行几十万字元会被 GHL 的编辑器截断，所以一定要切。"""
        if EMBED_IMAGES:
            uri = data_uri(rel)
            if uri:
                CHUNK = 500
                parts = [uri[i:i + CHUNK] for i in range(0, len(uri), CHUNK)]
                return '[\n' + ',\n'.join('    "%s"' % c for c in parts) + '\n  ].join("")'
        return json.dumps(rel)

    lines = ',\n'.join('  %-10s %s' % (k + ':', img_literal(v)) for k, v in cfg_imgs.items())
    override = (
        '<!-- ▼▼▼ 图片 —— 要换图改这几行就好，不用重新打包 ▼▼▼ -->\n'
        '<script>\n'
        'window.SANS26_IMAGES = {\n%s\n};\n'
        '</script>\n'
        '<!-- ▲▲▲ 图片结束 ▲▲▲ -->\n\n'
    ) % lines

    fragment = (
        '<!-- ===== Sans Wellness · the Legacy of Wellbeing (26th Anniversary) ===== -->\n'
        + override +
        '<style>\n@import url("%s");\n%s\n</style>\n\n'
        '<div id="sans26">\n%s\n</div>\n\n'
        '<script>\n%s\n</script>\n'
    ) % (FONTS, css, body.strip(), js)

    n_img = 2 if EMBED_IMAGES else 0

    OUT_DIR.mkdir(exist_ok=True)
    target = OUT_DIR / ('ghl-embed-with-images.html' if EMBED_IMAGES else 'ghl-embed.html')
    target.write_text(fragment, encoding='utf-8')

    size_kb = len(fragment.encode('utf-8')) // 1024
    print('→ %s' % target)
    print('   %d KB，图片内嵌 %d 张' % (size_kb, n_img))

    remaining = [] if EMBED_IMAGES else sorted(set(re.findall(r'"(assets/[^"]+)"', fragment)))
    if remaining:
        print('   ⚠️  这些还是相对路径，贴进 GHL 前请改成绝对网址'
              '（config.js 的 images）：\n       %s' % '\n       '.join(remaining))


if __name__ == '__main__':
    build()
