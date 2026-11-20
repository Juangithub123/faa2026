# Guía de logística FAA! 2026

- Sitio estático en GitHub Pages: https://juangithub123.github.io/faa2026/
- Los datos están en `data.json`. **Después de cada cambio en data.json, correr `python3 tools/build_cal.py`** para regenerar los calendarios de `cal/` y commitearlos junto con los datos.
- Al cambiar archivos de la app (app.js, app.css, index.html), subir `VERSION` en `sw.js`.
- Los juegos están en `juego/`; sus scripts llevan `?v=` en el HTML para forzar la actualización.
