#!/usr/bin/env python3
"""把 src/ 組成可發布的頁面。

python3 build.py          → index.html（GitHub Pages 用，完整 HTML 文件）
python3 build.py artifact → dist/artifact.html（Claude 內預覽用，沒有外層 html/head）
"""
import sys, pathlib
root = pathlib.Path(__file__).parent
src = root / 'src'
style = (src / 'style.css').read_text()
markup = (src / 'markup.html').read_text()
js = (src / 'game.js').read_text().replace('/*@@ZOO@@*/', (src / 'zoo.js').read_text()).replace('/*@@MAP@@*/', (src / 'map.js').read_text()).replace('/*@@WORKSHOP@@*/', (src / 'workshop.js').read_text()).replace('/*@@CONTROLS@@*/', (src / 'controls.js').read_text()).replace('/*@@BREEDING@@*/', (src / 'breeding.js').read_text()).replace('/*@@CREATIVE@@*/', (src / 'creative.js').read_text()).replace('/*@@ASSETS@@*/', (src / 'assets.js').read_text()).replace('/*@@OPS@@*/', (src / 'ops.js').read_text()).replace('/*@@RESEARCH@@*/', (src / 'research.js').read_text()).replace('/*@@MODES@@*/', (src / 'modes.js').read_text()).replace('/*@@BOSS@@*/', (src / 'boss.js').read_text()).replace('/*@@TRAIN@@*/', (src / 'train.js').read_text()).replace('/*@@COMBAT@@*/', (src / 'combat.js').read_text()).replace('/*@@CARE@@*/', (src / 'care.js').read_text()).replace('/*@@BIZ@@*/', (src / 'business.js').read_text()).replace('/*@@WORLD@@*/', (src / 'world.js').read_text()).replace('/*@@COOPZOO@@*/', (src / 'coopzoo.js').read_text())

HEAD = '''<title>烏托邦</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;700&family=Noto+Sans+TC:wght@400;700;900&display=swap">
'''
SCRIPTS = '''<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/SkeletonUtils.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>
'''
page = f"{HEAD}<style>\n{style}</style>\n{markup}{SCRIPTS}<script>\n{js}</script>\n"

if len(sys.argv) > 1 and sys.argv[1] == 'artifact':
    page = page.replace("'glb'/*@@MODEL_EXT@@*/", "'json'")
    import json as _j, struct as _s, base64 as _b
    for f in list((root / 'models').rglob('*.glb')) + list((root / 'models').rglob('*.gltf')):
        d = f.read_bytes()
        if f.suffix == '.gltf': j = _j.loads(d)
        else:
            jl = _s.unpack('<I', d[12:16])[0]; j = _j.loads(d[20:20+jl]); o = 20+jl
            if o < len(d):
                bl = _s.unpack('<I', d[o:o+4])[0]; j['buffers'][0]['uri'] = 'data:application/octet-stream;base64,' + _b.b64encode(d[o+8:o+8+bl]).decode()
        out = root / 'dist' / f.relative_to(root).with_suffix('.json'); out.parent.mkdir(parents=True, exist_ok=True); out.write_text(_j.dumps(j, separators=(',', ':')))
    (root / 'dist').mkdir(exist_ok=True)
    (root / 'dist' / 'artifact.html').write_text(page)
    print('dist/artifact.html')
else:
    full = ('<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
            '<meta name="theme-color" content="#0a111d">\n'
            '<style>body{margin:0;font:14px system-ui,sans-serif}[hidden]{display:none!important}img{max-width:100%}</style>\n'
            + page.replace('\n<canvas', '</head>\n<body>\n<canvas', 1) + '</body>\n</html>\n')
    (root / 'index.html').write_text(full)
    print('index.html')
