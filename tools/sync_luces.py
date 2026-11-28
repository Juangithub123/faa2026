#!/usr/bin/env python3
"""Copia el show de luces (repo ShowTelefonico) a luces/ de la guía, con los ajustes para vivir adentro de la guía.

Uso: python3 tools/sync_luces.py [carpeta de ShowTelefonico]   (por defecto ../luces-faa)

- Sin manifest ni service worker propios: los cubre el de la guía (sw.js, regla de /luces/).
- Botón «← Guía» en la pantalla de entrada del receptor y arriba del emisor.
- Los WAV del emisor se bajan del sitio de ShowTelefonico (no se copian).
Correrlo cada vez que cambie ShowTelefonico, y subir VERSION en sw.js.
"""
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '..', 'luces-faa'))
DST = os.path.join(ROOT, 'luces')
FILES = ['index.html', 'app.js', 'captura.js', 'decodificador.js', 'emisor.html', 'emisor.js', 'comandos.json', 'vendor/ggwave.js']
WAVS = 'https://juangithub123.github.io/ShowTelefonico/wav/'


def patch(name, fn):
    p = os.path.join(DST, name)
    with open(p, encoding='utf-8') as f:
        s = f.read()
    t = fn(s)
    if t == s:
        sys.exit('sync_luces: no se pudo ajustar ' + name + ' (¿cambió el original?)')
    with open(p, 'w', encoding='utf-8') as f:
        f.write(t)


def need(s, old, new):
    if old not in s:
        sys.exit('sync_luces: no encontré «' + old[:60] + '»')
    return s.replace(old, new)


os.makedirs(os.path.join(DST, 'vendor'), exist_ok=True)
for f in FILES:
    shutil.copyfile(os.path.join(SRC, f), os.path.join(DST, f))

patch('index.html', lambda s: need(need(need(s,
    '<link rel="manifest" href="manifest.webmanifest">\n', ''),
    '.warn{', '.back{position:fixed;left:12px;top:calc(10px + env(safe-area-inset-top));color:#A6AD9B;font:700 14px system-ui;text-decoration:none;border:1px solid #2F3529;border-radius:999px;padding:6px 12px}\n.warn{'),
    '<div class="ov" id="ov">\n', '<div class="ov" id="ov">\n  <a class="back" href="../">← Guía</a>\n'))
patch('app.js', lambda s: re.sub(r"\n  if \('serviceWorker' in navigator\) \{ navigator\.serviceWorker\.register\('sw\.js'\)[^\n]*", '', s))
patch('emisor.html', lambda s: need(s, '<h1>Emisor', '<p><a href="../">← Guía</a></p>\n<h1>Emisor'))
patch('emisor.js', lambda s: need(s, "var f = 'wav/' + m", "var f = '" + WAVS + "' + m"))
print('luces/ actualizado desde', SRC)
