#!/usr/bin/env python3
"""把臺北市立動物園開放資料（raw/taipei_zoo_animals.csv）匯入 data/species.json。

- 依中文名合併重複列（同一物種在多個展區）
- 已存在的物種沿用原本的 id 與模型，舊存檔不會壞
- 類別、稀有度、適溫、食性、群居、體型都由欄位推導，推導規則都在這支程式裡
重跑：python3 tools/import_taipei_zoo.py
"""
import csv, json, math, re, hashlib, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / 'raw' / 'taipei_zoo_animals.csv'
OUT = ROOT / 'data' / 'species.json'

existing = json.load(open(OUT, encoding='utf-8'))
by_name = {s['name']: s for s in existing}
ALIAS = {  # 官方名稱 → 遊戲裡原本的名稱
    '婆羅洲人猿': '婆羅洲紅毛猩猩', '臺灣黑熊': '臺灣黑熊', '台灣黑熊': '臺灣黑熊', '臺灣獼猴': '臺灣獼猴', '台灣獼猴': '臺灣獼猴',
    '梅花鹿': '臺灣梅花鹿', '臺灣梅花鹿': '臺灣梅花鹿', '台灣野山羊': '臺灣野山羊', '中華穿山甲': '穿山甲', '臺灣野豬': '臺灣野豬', '台灣野豬': '臺灣野豬',
    '亞洲小爪水獺': '小爪水獺', '孟加拉虎': '孟加拉虎', '馬來貘': '馬來貘', '松鼠猴': '黑帽松鼠猴', '南美浣熊': '南美浣熊',
    '斑馬': '查普曼斑馬', '查普曼氏斑馬': '查普曼斑馬', '劍羚': '南非劍羚', '白鬚牛羚': '牛羚', '伊蘭羚羊': '伊蘭羚羊',
    '西部低地大猩猩': '西部低地大猩猩', '金剛猩猩': '西部低地大猩猩', '東部灰袋鼠': '東部灰袋鼠', '鴯鶓': '鴯鶓',
    '亞達伯拉象龜': '亞達伯拉象龜', '印度星龜': '印度星龜', '藍舌蜥': '藍舌石龍子', '馬來長吻鱷': '馬來長吻鱷',
    '美洲野牛': '美洲野牛', '普氏野馬': '普氏野馬', '小貓熊': '小貓熊', '國王企鵝': '國王企鵝', '非洲企鵝': '非洲企鵝',
    '家驢': '驢', '長鼻浣熊': '南美浣熊', '黑冠松鼠猴': '黑帽松鼠猴', '灰袋鼠': '東部灰袋鼠', '東非劍羚': '南非劍羚', '網紋長頸鹿': '長頸鹿',
    '白鵜鶘': '鵜鶘', '黑腳企鵝': '非洲企鵝', '蒙古野馬': '普氏野馬', '山獅': '美洲獅', '長角大鍬形蟲': '鍬形蟲',
    '紅鶴': '大紅鶴', '大紅鶴': '大紅鶴', '丹頂鶴': '丹頂鶴', '黑面琵鷺': '黑面琵鷺', '藍腹鷴': '藍腹鷴', '臺灣藍鵲': '臺灣藍鵲', '台灣藍鵲': '臺灣藍鵲',
}

CLASS = {'哺乳綱': 'mammal', '鳥綱': 'bird', '爬蟲綱': 'reptile', '兩棲綱': 'reptile', '硬骨魚綱': 'aquatic', '軟骨魚綱': 'aquatic',
         '昆蟲綱': 'insect', '蛛形綱': 'insect', '唇足綱': 'insect'}
ZONE_TEMP = [('企鵝', [-10, 12]), ('溫帶', [-20, 25]), ('沙漠', [10, 42]), ('穿山甲', [20, 34]), ('雨林', [20, 34]), ('非洲', [10, 38]),
             ('澳洲', [10, 35]), ('無尾熊', [12, 32]), ('大貓熊', [-5, 24]), ('臺灣', [5, 30]), ('鳥園', [8, 32]), ('兒童', [0, 32]),
             ('兩棲爬蟲', [22, 34]), ('昆蟲', [18, 30])]
COLORS = [('黑', '#1d1c1e'), ('白', '#f2efe6'), ('紅', '#c8402a'), ('橘', '#e0802a'), ('黃', '#e8c040'), ('金', '#d9a840'), ('綠', '#3a8a4a'),
          ('藍', '#2a5ad8'), ('紫', '#6a3a9a'), ('灰', '#8a8a88'), ('褐', '#7a5a3e'), ('棕', '#7a5a3e'), ('咖啡', '#6a4a32'), ('粉', '#e8a0a8'), ('銀', '#b8bcc0')]
DEFAULT_COLOR = {'mammal': '#8a6a4a', 'bird': '#6a7a8a', 'reptile': '#5a6a3a', 'aquatic': '#5a8aa8', 'insect': '#5a4a3a'}

def norm_zone(loc):
    z = loc.split(';')[0].strip()
    z = re.sub(r'（.*?）|\(.*?\)', '', z).replace('室內館/', '').replace('鳥園區', '鳥園')
    return z or '其他'

def rarity(cons):
    c = cons.replace(' ', '')
    if re.search(r'CR|EW|極危|野外滅絕|瀕臨絕種', c): return 'legendary'
    if re.search(r'EN|瀕危', c): return 'endangered'
    if re.search(r'VU|NT|易危|近危|接近受威脅|珍貴稀有|保育類', c) and '非保護' not in c: return 'rare'
    return 'common'

def temp_for(locs):
    for key, t in ZONE_TEMP:
        if key in locs: return t
    return [5, 32]

def diet(text):
    for k, v in [('竹', '竹'), ('尤加利', '尤加利'), ('花蜜', '花蜜'), ('魚', '魚'), ('螞蟻', '螞蟻'), ('白蟻', '螞蟻'), ('昆蟲', '昆蟲'),
                 ('果', '果實'), ('種子', '種子'), ('肉', '肉'), ('獵', '肉'), ('葉', '樹葉'), ('草', '草')]:
        if k in text: return v
    return '雜食'

def social(text):
    if re.search(r'獨居|單獨', text): return '獨居'
    if re.search(r'群居|成群|群體|大群|社群', text): return '群居'
    return '小群'

def colors(text, cls):
    found = []
    for k, v in COLORS:
        i = text.find(k)
        if i >= 0: found.append((i, v))
    found.sort()
    cols = [v for _, v in found]
    c = cols[0] if cols else DEFAULT_COLOR[cls]
    a = cols[1] if len(cols) > 1 else c
    return c, a

def weight_kg(text):
    m = re.search(r'([\d.]+)\s*(?:[-~～至]\s*[\d.]+)?\s*(公斤|kg|公克|g)', text)
    if not m: return None
    v = float(m.group(1))
    return v / 1000 if m.group(2) in ('公克', 'g') else v

def body(row, cls):
    order, fam, feat = row['A_Order'], row['A_Family'], row['A_Feature']
    c, a = colors(feat, cls)
    kg = weight_kg(feat)
    size = 1.0 if kg is None else max(0.35, min(3.0, 0.45 + math.log10(max(kg, 0.01)) * 0.45))
    b = {'color': c, 'accent': a}
    if cls == 'mammal':
        if order == '靈長目':
            b.update(type='primate', big=(kg or 0) > 40, tail='猿' not in row['A_Name_Ch'], longArms='長臂猿' in row['A_Name_Ch'])
            size = max(0.45, min(1.6, size))
        elif order in ('袋鼠目', '雙門齒目') and '袋鼠' in row['A_Name_Ch']:
            b.update(type='primate', upright=True, tail=True, ears=True)
        elif order == '長鼻目': b.update(type='quad', trunk=True, bulky=True, ears=True, tusks='非洲' in row['A_Name_Ch']); size = max(size, 2.4)
        elif order == '鱗甲目': b.update(type='quad', long=True, tail=True, scales=True)
        elif order == '披毛目': b.update(type='quad', snout=True, tail=True)
        elif order in ('囓齒目', '嚙齒目'): b.update(type='quad', bulky='水豚' in row['A_Name_Ch'])
        elif order == '奇蹄目':
            if '犀' in fam: b.update(type='quad', bulky=True, horn=True); size = max(size, 2.0)
            elif '貘' in fam: b.update(type='quad', bulky=True, saddle='馬來' in row['A_Name_Ch'])
            else: b.update(type='quad', longLegs=True, mane=True, stripes='斑馬' in row['A_Name_Ch'], ears='驢' in row['A_Name_Ch'])
        elif order in ('偶蹄目', '鯨偶蹄目'):
            if '長頸鹿' in fam: b.update(type='quad', neck=2.2, longLegs=True, spots=True)
            elif '駱駝' in fam: b.update(type='quad', neck=0.6, longLegs=True, humps=2 if '雙峰' in row['A_Name_Ch'] else (1 if '駱駝' in row['A_Name_Ch'] else 0))
            elif '河馬' in fam: b.update(type='quad', bulky=True, short=True)
            elif '豬' in fam: b.update(type='quad', bulky=True)
            elif '鹿' in fam: b.update(type='quad', antlers=True, longLegs=True)
            else: b.update(type='quad', horns=True, longLegs=True)
        else:  # 食肉目等
            b.update(type='quad', tail=True)
            if '熊' in fam: b.update(bulky=True, tail=False)
            if '鼬' in fam or '獴' in fam: b.update(long=True)
            if '犬' in fam: b.update(ears=True)
            if '獅' in row['A_Name_Ch']: b.update(mane=True)
            if '虎' in row['A_Name_Ch']: b.update(stripes=True)
            if '豹' in row['A_Name_Ch']: b.update(spots=True)
    elif cls == 'bird':
        if order == '企鵝目': b = {'type': 'penguin'}; size = 0.9
        else:
            b.update(type='bird')
            if order in ('鴕形目', '食火雞目'): b.update(ratite=True); size = max(size, 1.6)
            elif order in ('鶴形目', '鶴目', '鸛形目', '紅鶴目', '鵜形目'): b.update(longLegs=True, neck=order != '鵜形目')
            elif order == '雞形目': b.update(longTail=True)
            elif '犀鳥' in row['A_Name_Ch']: b.update(casque=True)
            size = max(0.45, min(size, 1.6)) if order not in ('鴕形目', '食火雞目') else size
    elif cls == 'reptile':
        if row['A_Class'] == '兩棲綱' or order == '無尾目': b.update(type='frog'); size = 0.5
        elif order == '龜鱉目': b.update(type='reptile', shell=True); size = max(0.5, min(size, 1.6))
        elif order == '鱷目': b.update(type='reptile', croc=True); size = max(size, 1.6)
        elif re.search(r'蛇|蟒|蝮|蝰', row['A_Name_Ch'] + fam): b.update(type='reptile', snake=True); size = max(0.6, min(size, 1.4))
        else: b.update(type='reptile'); size = max(0.5, min(size, 1.4))
    elif cls == 'aquatic':
        b.update(type='fish', ray=order == '魟目'); size = max(0.5, min(size, 1.6))
    else:
        b.update(type='insect')
        if order in ('鱗翅目', '蜻蛉目'): b.update(wings=True)
        elif order == '竹節蟲目': b.update(stick=True)
        elif order == '鞘翅目': b.update(horn='兜' in row['A_Name_Ch'] or '獨角' in row['A_Name_Ch'], pincers='鍬' in row['A_Name_Ch'])
        size = 0.5
    b['size'] = round(size, 2)
    return {k: v for k, v in b.items() if v not in (False, None, 0)}

def short(text, n=70):
    t = re.sub(r'^\s*\d+[、.．]\s*', '', text.strip().split('\n')[0]).strip()
    return t[:n] + ('…' if len(t) > n else '')

def slug(row):
    base = (row['A_Name_En'] or row['A_Name_Latin'] or '').lower()
    base = re.sub(r'[^a-z0-9]+', '_', base).strip('_')
    if not base: base = 'sp_' + hashlib.md5(row['A_Name_Ch'].encode()).hexdigest()[:8]
    return base

rows = list(csv.DictReader(open(RAW, encoding='utf-8-sig')))
merged = {}
for r in rows:
    n = r['A_Name_Ch'].strip().replace('?', '')
    if not n: continue
    if n in merged: merged[n]['_locs'] += ';' + r['A_Location']
    else: r['_locs'] = r['A_Location']; merged[n] = r

out, used_ids, matched = [], set(), set()
ATTR = {'common': 4, 'rare': 7, 'endangered': 10, 'legendary': 14}
for name, r in merged.items():
    cls = CLASS.get(r['A_Class'])
    if not cls: continue
    old = by_name.get(ALIAS.get(name, name))
    rar = rarity(r['A_Conservation'])
    text = r['A_Behavior'] + r['A_Summary']
    s = {
        'id': old['id'] if old else slug(r),
        'name': name,
        'nameEn': r['A_Name_En'], 'latin': r['A_Name_Latin'],
        'category': cls,
        'zone': norm_zone(r['_locs']),
        'rarity': rar,
        'conservation': r['A_Conservation'].strip(),
        'model': old.get('model') if old else None,
        'body': old.get('body') if old and old.get('body') else body(r, cls),
        'tempRange': old['tempRange'] if old else temp_for(r['_locs']),
        'diet': old['diet'] if old else diet(r['A_Diet']),
        'social': old['social'] if old else social(text),
        'attract': old['attract'] if old else ATTR[rar] + (2 if cls == 'mammal' else 0),
        'fact': short(r['A_Feature'] or r['A_Summary'] or r['A_Habitat']),
        'spawn': ['ruins'] if cls in ('mammal', 'bird', 'reptile') else [],
    }
    if old: matched.add(old['id'])
    while s['id'] in used_ids: s['id'] += '_b'
    used_ids.add(s['id'])
    out.append(s)

# 遊戲原有、但官方名單沒有的物種（冰原原生、雲豹等）保留
kept = [s for s in existing if s['id'] not in matched and s['id'] not in used_ids]
out = kept + out
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
from collections import Counter
print(len(out), '種；沿用', len(matched), '；保留遊戲原有', len(kept), [s['name'] for s in kept])
print(Counter(s['category'] for s in out), Counter(s['rarity'] for s in out))
