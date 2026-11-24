#!/usr/bin/env python3
"""Arma la app pública del FAA! 2026 a partir de la guía del staff.

Uso:  python3 tools/build_public.py [CARPETA_DE_SALIDA]      (por defecto ../faa-publico)

La salida es una carpeta lista para publicar en su propio repositorio de GitHub Pages.
Solo lleva lo público: el programa, las sedes con actividades, el PDF, los calendarios,
los juegos SIN ranking ni pozo, y la cámara. Nada de turnos, traslados, personas,
notas, pendientes ni avisos internos. Al final revisa que no se haya colado nada.
La dirección pública va en tools/publico.json ("base"); se usa en los calendarios.
"""
import json, os, re, shutil, subprocess, sys, hashlib, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(os.path.dirname(ROOT), 'faa-publico')
CFG = json.load(open(os.path.join(ROOT, 'tools', 'publico.json'), encoding='utf-8'))
BASE = CFG.get('base', '')
HIDDEN_VENUES = {'merl'}   # nunca se publica (depósito en una casa particular)

d = json.load(open(os.path.join(ROOT, 'data.json'), encoding='utf-8'))


def rp(*p):
    return os.path.join(ROOT, *p)


def op(*p):
    return os.path.join(OUT, *p)


def copy(src, dst=None):
    dst = op(dst or src)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.isdir(rp(src)):
        shutil.copytree(rp(src), dst, dirs_exist_ok=True)
    else:
        shutil.copy2(rp(src), dst)


# ---------- limpiar la salida (menos el .git) ----------
os.makedirs(OUT, exist_ok=True)
for name in os.listdir(OUT):
    if name == '.git':
        continue
    p = op(name)
    shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)

# ---------- datos públicos ----------
events = []
for e in d['events']:
    if e.get('tag') == 'Equipo' or e.get('v') in HIDDEN_VENUES:
        continue
    x = {k: e[k] for k in ('id', 'day', 's', 'e', 't', 'v', 'room', 'tag') if k in e and e[k] not in (None, '')}
    if 'e' in e:
        x['e'] = e['e']
    desc = e['pd'] if 'pd' in e else e.get('d', '')   # pd: descripción pública
    if desc:
        x['d'] = desc
    if e.get('films'):
        x['films'] = e['films']
    events.append(x)
used = {e['v'] for e in events}
venues = {}
for k, v in d['venues'].items():
    if k in used and k not in HIDDEN_VENUES:
        venues[k] = {f: v[f] for f in ('n', 'addr', 'lat', 'lng', 'pid', 'q', 'nomap') if f in v}
days = [{f: x[f] for f in ('k', 'dow', 'name', 'date', 'theme') if f in x} for x in d['days']]
gcal = {}
gid = json.load(open(rp('tools', 'gcal_ids.json'), encoding='utf-8'))
import base64
for k, c in gid['calendars'].items():
    gcal[k] = 'https://calendar.google.com/calendar/u/0?cid=' + base64.b64encode(c.encode()).decode().rstrip('=')
pub = {'meta': {'updated': d.get('meta', {}).get('updated', '')}, 'days': days, 'venues': venues, 'events': events, 'gcal': gcal}
with open(op('datos.json'), 'w', encoding='utf-8') as fh:
    json.dump(pub, fh, ensure_ascii=False, separators=(',', ':'))

# ---------- app ----------
for f in os.listdir(rp('publico')):
    copy(os.path.join('publico', f), f)
css = open(rp('app.css'), encoding='utf-8').read() + '\n/* app pública */\n.pub .nav{grid-template-columns:repeat(4,1fr)}\n'
open(op('app.css'), 'w', encoding='utf-8').write(css)
for f in ('logo.webp', 'map.webp', 'cronograma-faa-2026.pdf', 'icons', 'vendor'):
    copy(f)
for e in events:
    for fl in e.get('films') or []:
        if isinstance(fl, dict) and fl.get('img'):
            copy(fl['img'])
open(op('.nojekyll'), 'w').close()
open(op('README.md'), 'w', encoding='utf-8').write(
    '# FAA! 2026 · app del público\n\nPrograma, sedes, mapa, calendario, juegos y cámara del Festival Artístico Audiovisual FAA! 2026 (El Bolsón, 25 al 29 de noviembre).\n\n'
    'Sitio estático. No tiene cuentas ni guarda datos de quien la usa fuera de su propio teléfono.\n')

# ---------- juegos (sin ranking ni pozo) y cámara ----------
for f in ('arte.js', 'juego.js', 'side.png', 'back.png', 'atlas.png', 'n26.png', 'index.html', 'carriles/index.html', 'carriles/carriles.js',
          'tera-tiles/index.html', 'tera-tiles/midi.js', 'tera-tiles/sync.js', 'tera-tiles/songs'):
    copy('juego/' + f)
for f in ('index.html', 'mascaras.js', 'mp'):
    copy('mascaras/' + f)


def patch(rel, subs):
    p = op(rel)
    s = open(p, encoding='utf-8').read()
    for a, b in subs:
        s = re.sub(a, b, s)
    open(p, 'w', encoding='utf-8').write(s)


BACK = [(r'<script[^>]*src="[^"]*(ranking|rank)\.js[^"]*"[^>]*>\s*</script>\s*', ''),
        (r'Volver a la guía', 'Volver a la app del FAA!'), (r'>← Guía<', '>← FAA!<')]
patch('juego/index.html', BACK + [(r'href="\.\./#hoy"', 'href="../#juegos"')])
patch('juego/carriles/index.html', BACK + [(r'href="\.\./\.\./#hoy"', 'href="../../#juegos"')])
patch('juego/tera-tiles/index.html', BACK + [(r'href="\.\./\.\./#hoy"', 'href="../../#juegos"')])
patch('mascaras/index.html', BACK + [(r'<a href="\.\./">', '<a href="../#juegos">')])

# ---------- calendarios ----------
subprocess.run([sys.executable, rp('tools', 'build_cal.py'), '--public', op('cal'), BASE], check=True)

# ---------- versión del service worker ----------
h = hashlib.sha1()
for dp, _, fs in sorted(os.walk(OUT)):
    if '/.git' in dp:
        continue
    for f in sorted(fs):
        if f == 'sw.js':
            continue
        h.update(f.encode()); h.update(open(os.path.join(dp, f), 'rb').read())
patch('sw.js', [(r'__BUILD__', h.hexdigest()[:10])])

# ---------- control: que no se haya colado nada del staff ----------
problems = []
names = {p['n'] for p in d['people']}
credits = json.dumps(pub, ensure_ascii=False)
for dp, _, fs in os.walk(OUT):
    if '/.git' in dp or '/mp' in dp or '/songs' in dp or '/sel' in dp:
        continue
    for f in fs:
        if not f.endswith(('.js', '.html', '.json', '.ics', '.webmanifest', '.md', '.css')):
            continue
        s = open(os.path.join(dp, f), encoding='utf-8', errors='ignore').read()
        rel = os.path.relpath(os.path.join(dp, f), OUT)
        for bad in ('script.google.com', 'juangithub123', 'Merlin', 'ranking.js', 'rank.js', 'pids', '"shifts"', '"transfers"', '"people"', 'pendientes'):
            if bad in s:
                problems.append(rel + ': ' + bad)
# nombres del staff que no están como créditos del programa
for n in names:
    if n in open(op('datos.json'), encoding='utf-8').read() and n not in credits:
        problems.append('datos.json: ' + n)
size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) if '/.git' not in dp for f in fs)
print('app pública en', OUT, '·', len(events), 'actividades ·', len(venues), 'sedes ·', round(size / 1e6, 1), 'MB')
if problems:
    print('REVISAR (posible info interna):'); [print('  ' + p) for p in problems]; sys.exit(1)
print('control: sin datos del staff')
