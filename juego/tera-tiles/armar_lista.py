# Arma songs/lista.json con todos los .mid de la carpeta songs/.
# Uso (desde la carpeta del juego):  python armar_lista.py
# Respeta títulos y artistas que ya hayas escrito a mano en lista.json.
import json, os, re

carpeta = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'songs')
ruta = os.path.join(carpeta, 'lista.json')
previa = {}
if os.path.exists(ruta):
    with open(ruta, encoding='utf-8') as f:
        previa = {x['file']: x for x in json.load(f)}

lista = []
for nombre in sorted(os.listdir(carpeta), key=str.lower):
    if not re.search(r'\.(mid|midi|kar)$', nombre, re.I):
        continue
    if nombre in previa:
        lista.append(previa[nombre])
        continue
    titulo = re.sub(r'\.(mid|midi|kar)$', '', nombre, flags=re.I)
    titulo = re.sub(r'^[0-9a-f]{6,}[-_]', '', titulo, flags=re.I)
    titulo = re.sub(r'[-_]+', ' ', titulo).strip()
    lista.append({'file': nombre, 'title': titulo, 'artist': ''})

with open(ruta, 'w', encoding='utf-8') as f:
    json.dump(lista, f, ensure_ascii=False, indent=2)
print(f'{len(lista)} temas en songs/lista.json')
