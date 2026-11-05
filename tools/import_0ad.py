#!/usr/bin/env python3
"""匯入 0 A.D. 的動物模型（Wildfire Games，CC-BY-SA 3.0）。

流程：讀 0 A.D. 的 actor/variant 設定 → 下載 .dae 模型、動畫與貼圖
     → 轉成 glTF（先用 assimp，失敗再用 three.js 備援）→ 寫進 models/0ad/
     → 更新 data/assets.json 的 zad 與 species 對應。
需要：pip 的 Pillow、tools/node 底下 `npm i` 過的轉檔工具。
重跑：python3 tools/import_0ad.py
"""
import json, os, subprocess, urllib.request, xml.etree.ElementTree as ET, pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
NODE = ROOT / 'tools' / 'node'
OUT = ROOT / 'models' / '0ad'
CACHE = pathlib.Path('/tmp/0ad-cache')
SRC = 'https://raw.githubusercontent.com/0ad/0ad/master/binaries/data/mods/public/art/'
OUT.mkdir(parents=True, exist_ok=True); CACHE.mkdir(exist_ok=True)

# 0 A.D. actor → 遊戲物種（高度單位：公尺；tint 用來做同模型不同物種的毛色）
MAP = {
    'elephant_african_bush': [('african_elephant', 3.2, None)],
    'elephant_asian': [('asian_elephant', 2.7, None)],
    'giraffe_adult': [('giraffe', 5.0, None)],
    'zebra': [('chapman_zebra', 1.4, None)],
    'lion': [('lion', 1.2, None)],
    'tiger': [('bengal_tiger', 1.0, None), ('malayan_tiger', 0.9, None)],
    'rhino': [('white_rhino', 1.8, None)],
    'hippopotamus': [('hippo', 1.5, None), ('pygmy_hippo', 0.85, '#4a3f42')],
    'bear_white': [('polar_bear', 1.6, None)],
    'bear_brown': [('brown_bear', 1.4, None)],
    'bear_black': [('asiatic_black_bear', 1.0, None), ('formosan_black_bear', 0.95, None), ('malayan_sun_bear', 0.7, None)],
    'wolf': [('gray_wolf', 0.85, None)],
    'fox_arctic': [('arctic_fox', 0.45, None)],
    'camel': [('dromedary_camel_one_humped_camel', 2.0, None), ('bactrian_camel', 2.0, '#8a6a48')],
    'crocodile': [('chinese_alligator', 0.4, None), ('false_gharial', 0.55, '#4a4a3a')],
    'muskox': [('musk_ox', 1.4, None)],
    'peacock': [('common_peafowl', 1.0, None)],
    'wildebeest': [('wildebeest', 1.3, None)],
    'gazelle': [('addax', 1.1, '#e0d4bc'), ('gemsbok', 1.2, '#b8aea2'), ('common_eland', 1.6, '#c4a27a'), ('bongo', 1.2, '#a8452a')],
    'deer': [('sika_deer', 1.0, None), ('formosan_sambar', 1.3, '#5a4434'), ('formosan_reeve_s_muntjac', 0.55, '#9a6a42')],
    'goat': [('taiwan_serow', 0.8, '#3a3430'), ('barbary_sheep_aoudad', 0.9, '#a8845a')],
    'pig1': [('domestic_pig', 0.8, None), ('lanyu_pig', 0.6, '#2a2624')],
    'boar': [('wild_boar', 0.85, None)],
    'horse_brown': [('przewalski_horse', 1.4, '#c49a64')],
    'pony': [('pony', 1.0, None)],
    'donkey': [('donkey', 1.2, None), ('african_wild_ass', 1.3, '#b8b0a6')],
    'rabbit1': [('rabbit', 0.3, None), ('arctic_hare', 0.35, '#f2f2f0')],
    'chicken': [('chicken', 0.4, None), ('gray_jungle_fowl', 0.4, None)],
    'hawk': [('crested_serpent_eagle', 0.6, None), ('hodgson_s_hawk_eagle', 0.7, None)],
    'crow': [('jungle_crow', 0.4, None)],
    'bull': [('american_bison', 1.7, '#4a3424')],
    'walrus': [('harbor_seal', 0.6, '#7a7470')],
}

def get(path):
    fn = CACHE / path.replace('/', '__')
    if not fn.exists():
        try:
            with urllib.request.urlopen(SRC + path, timeout=60) as r: fn.write_bytes(r.read())
        except Exception: return None
    return fn

def collect(el, info):
    for v in el.iter('variant'):
        if v.get('file'):
            p = get('variants/' + v.get('file'))
            if p: collect(ET.parse(p).getroot(), info)
        m = v.find('mesh')
        if m is not None and 'mesh' not in info: info['mesh'] = m.text.strip()
        for t in v.iter('texture'):
            if t.get('name') == 'baseTex' and 'tex' not in info: info['tex'] = t.get('file')
        for a in v.iter('animation'):
            n = a.get('name', '').lower()
            if n in ('walk', 'idle', 'run') and n not in info.setdefault('anims', {}): info['anims'][n] = a.get('file')

def convert(src, base):
    """回傳輸出的檔名（glb 或 gltf），失敗回傳 None"""
    glb = OUT / (base + '.glb')
    r = subprocess.run(['node', str(NODE / 'dae2glb_assimp.js'), f'{src}:{glb}'], capture_output=True, text=True, cwd=NODE)
    if 'ok' in r.stdout: return glb.name
    gltf = OUT / (base + '.gltf')
    r = subprocess.run(['node', str(NODE / 'dae2gltf_three.js'), f'{src}:{gltf}'], capture_output=True, text=True, cwd=NODE)
    return gltf.name if 'ok' in r.stdout else None

assets_path = ROOT / 'data' / 'assets.json'
A = json.load(open(assets_path, encoding='utf-8'))
A.setdefault('zad', {})
for name, targets in MAP.items():
    ap = get('actors/fauna/' + name + '.xml')
    if not ap: print('沒有 actor', name); continue
    info = {}; collect(ET.parse(ap).getroot(), info)
    if 'mesh' not in info: print('沒有模型', name); continue
    mp = get('meshes/' + info['mesh'])
    mesh = convert(mp, name) if mp else None
    if not mesh: print('轉檔失敗', name); continue
    anims = {}
    for k, f in info.get('anims', {}).items():
        p = get('animation/' + f)
        o = convert(p, f'{name}__{k}') if p else None
        if o: anims[k] = '0ad/' + o
    tex = None
    if info.get('tex'):
        t = info['tex']
        tp = get('textures/skins/' + t) or get('textures/skins/' + t.rsplit('.', 1)[0] + '.png') or get('textures/skins/' + t.rsplit('.', 1)[0] + '.dds')
        if tp:
            try:
                Image.open(tp).convert('RGB').resize((512, 512), Image.LANCZOS).save(OUT / (name + '.jpg'), quality=85); tex = '0ad/' + name + '.jpg'
            except Exception as e: print('貼圖失敗', name, e)
    A['zad'][name] = {'mesh': '0ad/' + mesh, 'anims': anims, 'tex': tex}
    for sid, h, tint in targets:
        e = {'zad': name, 'height': h}
        if tint: e['tint'] = tint
        A['species'][sid] = e
    print('完成', name, mesh, list(anims), '貼圖' if tex else '無貼圖')

A['_credits'] = A.get('_credits', []) + [x for x in ['0 A.D. 動物模型 © Wildfire Games（https://www.wildfiregames.com/），CC-BY-SA 3.0（https://creativecommons.org/licenses/by-sa/3.0/）'] if x not in A.get('_credits', [])]
json.dump(A, open(assets_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
