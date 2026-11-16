/* Configuración de la guía de logística FAA! 2026.
   Para conectar una planilla de Google Sheets, agregá una línea en "sources" con su link
   (la planilla tiene que estar compartida como "Cualquier persona con el enlace: lector"
   o publicada en la web). "type" dice qué parte de la guía reemplaza esa hoja. */
window.FAA_CONFIG = {
  pollMinutes: 5,
  sources: [
    // { name: 'Cronograma', type: 'eventos',   url: 'https://docs.google.com/spreadsheets/d/ID/edit#gid=0' },
    // { name: 'Turnos',     type: 'turnos',    url: 'https://docs.google.com/spreadsheets/d/ID/edit#gid=123' },
    // { name: 'Traslados',  type: 'traslados', url: '...' },
    // { name: 'Equipo',     type: 'personas',  url: '...' },
    // { name: 'Avisos',     type: 'avisos',    url: '...' }
  ]
};
