#!/usr/bin/env python3
"""Genera los calendarios (.ics) de la guía a partir de data.json.

Correr después de cada cambio en data.json:  python3 tools/build_cal.py
y commitear la carpeta cal/ junto con data.json.

Salida en cal/:
  ev/<id>.ics          una actividad del cronograma
  todo.ics             todo el festival (sin las tareas internas del equipo)
  proyecciones.ics     proyecciones, estrenos y competencias
  talleres.ics         talleres, workshops, seminarios y charlas
  noches.ics           Noches FAA!, sunsets, ceremonias, desfile y RAVE
  staff/<pid>.ics      turnos oficiales de cada persona del staff
Todos traen un aviso 1 hora antes.
"""
import json, os, datetime, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://juangithub123.github.io/faa2026/'
OUT = os.path.join(ROOT, 'cal')
TZ = datetime.timezone(datetime.timedelta(hours=-3))  # Argentina, sin horario de verano

d = json.load(open(os.path.join(ROOT, 'data.json'), encoding='utf-8'))
DAYS = d['days']
VEN = d['venues']
AREAS = d['areas']
PEOPLE = {p['id']: p for p in d['people']}
STAMP = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')


def esc(t):
    return str(t).replace('\\', '\\\\').replace(';', '\\;').replace(',', '\\,').replace('\r', '').replace('\n', '\\n')


def fold(line):
    """Corta las líneas largas a 75 bytes, como pide el formato."""
    b = line.encode('utf-8')
    if len(b) <= 75:
        return line
    parts, cur = [], b''
    for ch in line:
        cb = ch.encode('utf-8')
        if len(cur) + len(cb) > (75 if not parts else 74):
            parts.append(cur.decode('utf-8'))
            cur = b''
        cur += cb
    parts.append(cur.decode('utf-8'))
    return '\r\n '.join(parts)


def when(day, minutes):
    base = datetime.datetime.fromisoformat(DAYS[day]['date']).replace(tzinfo=TZ)
    return (base + datetime.timedelta(minutes=minutes)).astimezone(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')


def place(v, room=''):
    x = VEN.get(v) or {}
    if not x or v == 'tbc':
        return 'A confirmar'
    if x.get('nomap'):
        name = x.get('n', '')
        return name if v != 'merl' else ''
    s = x.get('n', '')
    if room:
        s += ' · ' + room
    if x.get('addr'):
        s += ', ' + x['addr'] + ', El Bolsón'
    return s


def vevent(uid, day, s, e, title, loc, desc, url):
    end = e if e is not None else s + 120
    L = ['BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + STAMP, 'DTSTART:' + when(day, s), 'DTEND:' + when(day, end),
         'SUMMARY:' + esc(title)]
    if loc:
        L.append('LOCATION:' + esc(loc))
    if desc:
        L.append('DESCRIPTION:' + esc(desc))
    L += ['URL:' + url, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(title), 'TRIGGER:-PT1H', 'END:VALARM', 'END:VEVENT']
    return L


def calendar(name, events, desc=''):
    L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FAA! 2026//Guia de logistica//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
         'X-WR-CALNAME:' + esc(name), 'X-WR-TIMEZONE:America/Argentina/Buenos_Aires',
         'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H']
    if desc:
        L.append('X-WR-CALDESC:' + esc(desc))
    for ev in events:
        L += ev
    L.append('END:VCALENDAR')
    return '\r\n'.join(fold(x) for x in L) + '\r\n'


def ev_desc(e):
    out = []
    if e.get('d'):
        out.append(e['d'])
    if e.get('films'):
        out.append('Programa:')
        for f in e['films']:
            out.append('· ' + f['t'] + (' — ' + f['by'] if f.get('by') else ''))
    if e.get('flag'):
        out.append('A confirmar: ' + e['flag'])
    out.append('FAA! 2026 · Festival Artístico Audiovisual · El Bolsón')
    return '\n'.join(out)


def ev_block(e):
    return vevent('faa2026-' + e['id'] + '@juangithub123.github.io', e['day'], e['s'], e.get('e'), e['t'] + ' · FAA! 2026',
                  place(e['v'], e.get('room', '')), ev_desc(e), BASE + '#programa-' + str(DAYS[e['day']]['k']))


def group(e):
    t, tag = e['t'].lower(), e.get('tag', '')
    g = set()
    if tag in ('Proyección', 'Estreno') or 'proyección' in t or 'competencia' in t or 'película' in t:
        g.add('proyecciones')
    if tag in ('Taller', 'Workshop', 'Seminario', 'Charla') or 'conversatorio' in t:
        g.add('talleres')
    if tag in ('Noche FAA!', 'Sunset', 'Ceremonia', 'Desfile', 'RAVE'):
        g.add('noches')
    return g


def write(rel, text):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    old = open(p, encoding='utf-8').read() if os.path.exists(p) else None
    # no reescribir si solo cambia la marca de tiempo (DTSTAMP)
    strip = lambda s: '\n'.join(l for l in (s or '').splitlines() if not l.startswith('DTSTAMP:'))
    if old is not None and strip(old) == strip(text):
        return False
    open(p, 'w', encoding='utf-8', newline='').write(text)
    return True


def main():
    pub = [e for e in d['events'] if e.get('tag') != 'Equipo']
    changed = 0
    keep = set()
    for e in pub:
        rel = 'ev/' + e['id'] + '.ics'; keep.add(rel)
        changed += write(rel, calendar(e['t'] + ' · FAA! 2026', [ev_block(e)]))
    groups = {
        'todo': ('FAA! 2026 · Todo el festival', pub),
        'proyecciones': ('FAA! 2026 · Proyecciones', [e for e in pub if 'proyecciones' in group(e)]),
        'talleres': ('FAA! 2026 · Talleres y charlas', [e for e in pub if 'talleres' in group(e)]),
        'noches': ('FAA! 2026 · Noches, ceremonias y fiestas', [e for e in pub if 'noches' in group(e)]),
    }
    for k, (name, evs) in groups.items():
        rel = k + '.ics'; keep.add(rel)
        changed += write(rel, calendar(name, [ev_block(e) for e in evs], 'Festival Artístico Audiovisual FAA! 2026 · El Bolsón · 25 al 29 de noviembre'))
    # turnos oficiales de cada persona (sin las sugerencias)
    members = {}
    for p in d['people']:
        for a in p.get('a') or []:
            members.setdefault(a, []).append(p['id'])
    mine = {pid: [] for pid in PEOPLE}
    for sh in d['shifts']:
        if sh.get('sug'):
            continue
        pids = sh['pids'] if sh.get('pids') is not None else members.get(sh['area'], [])
        for pid in pids:
            if pid in mine:
                mine[pid].append(sh)
    for pid, shs in mine.items():
        evs = []
        for sh in sorted(shs, key=lambda x: (x['day'], x['s'])):
            area = AREAS.get(sh['area'], {}).get('n', '')
            desc = 'Turno de ' + area + '.' + ('\n' + sh['note'] if sh.get('note') else '') + \
                   ('\nCon: ' + ', '.join(sh.get('who') or []) if sh.get('who') else '') + '\nGuía del staff: ' + BASE
            evs.append(vevent('faa2026-' + sh['id'] + '-' + pid + '@juangithub123.github.io', sh['day'], sh['s'], sh.get('e'),
                              'Turno FAA!: ' + sh['t'], place(sh['v']), desc, BASE + '#turnos-' + str(DAYS[sh['day']]['k'])))
        rel = 'staff/' + pid + '.ics'; keep.add(rel)
        changed += write(rel, calendar('FAA! 2026 · Mis turnos (' + PEOPLE[pid]['n'].split(' ')[0] + ')', evs, 'Turnos oficiales del staff del FAA! 2026'))
    # borrar calendarios de actividades o personas que ya no existen
    for dp, _, fs in os.walk(OUT):
        for f in fs:
            rel = os.path.relpath(os.path.join(dp, f), OUT).replace(os.sep, '/')
            if rel.endswith('.ics') and rel not in keep:
                os.remove(os.path.join(dp, f)); changed += 1
    print('calendarios actualizados:', changed)


if __name__ == '__main__':
    main()
