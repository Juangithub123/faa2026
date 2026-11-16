# Logística FAA! 2026 · app del equipo

Web liviana e instalable (PWA) con los turnos, el programa, los traslados y los avisos del FAA! 2026.

## Archivos
- `index.html`, `app.css`, `app.js`: la app (sin dependencias, sin fuentes externas).
- `data.json`: todos los datos (cronograma, turnos, traslados, ambientación, equipo, avisos). Es la base.
- `config.js`: planillas de Google Sheets conectadas y cada cuántos minutos se revisan.
- `sw.js` + `manifest.webmanifest` + `icons/`: instalación en el teléfono y funcionamiento sin señal.
- `map.webp`, `logo.webp`: imágenes (el mapa se carga solo cuando se abre).

## Publicar en GitHub Pages
1. Crear un repo (por ejemplo `faa2026`) y subir **el contenido** de esta carpeta a la raíz.
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)` → Save.
3. En un minuto queda en `https://USUARIO.github.io/faa2026/`.

## Cómo se actualiza
- La app guarda los datos en el teléfono y busca cambios al abrirse, cada 5 minutos mientras está abierta y al volver la señal.
- Si algo cambió, muestra un aviso, suma el cambio en **Novedades** (campana) y marca con «Cambió» lo modificado. Si el cambio toca a la persona (su turno, su área), se lo destaca.
- Para cambiar datos: editar `data.json` en GitHub, o conectar planillas en `config.js` (tipos: `eventos`, `turnos`, `traslados`, `personas`, `avisos`). La planilla tiene que estar compartida como «Cualquier persona con el enlace: lector» o publicada en la web.
- Si se modifica `app.js`, `app.css` o `index.html`, subir el número de `VERSION` en `sw.js` para que los teléfonos bajen la versión nueva.
