# Guía de logística FAA! 2026

- Sitio estático en GitHub Pages: https://juangithub123.github.io/faa2026/
- Los datos están en `data.json`. **Después de cada cambio en data.json, correr `python3 tools/build_cal.py`** para regenerar los calendarios de `cal/` y commitearlos junto con los datos.
- Al cambiar archivos de la app (app.js, app.css, index.html), subir `VERSION` en `sw.js`.
- Los juegos están en `juego/`; sus scripts llevan `?v=` en el HTML para forzar la actualización.
- Los grupos del Programa también están en tres calendarios públicos de Google (Todo, Proyecciones, Talleres) que se cargan con la conexión de Google Calendar. Los ids de calendarios y eventos están en `tools/gcal_ids.json`: **si cambia una actividad en data.json, actualizar también esos eventos** (update_event / create_event / delete_event) y guardar los ids nuevos.
- **App pública** (sin datos del staff): se arma con `python3 tools/build_public.py ../faa-publico` desde `publico/` + datos filtrados, y se publica en su propio repo (dirección en `tools/publico.json`). Después de cada cambio en data.json o en los juegos, volver a armarla y publicarla. El script termina con error si detecta info interna.
