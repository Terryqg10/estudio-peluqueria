// Datos del salón ficticio. Todo es dato de semilla: VERIFICAR y sustituir
// cuando el negocio sea real (SPEC-001, sección 9; PLAN-001, notas técnicas).
export const SITE = {
  name: 'Atelier Malva', // VERIFICAR: nombre provisional, comprobar que no coincide con un negocio real
  tagline: 'Peluquería de mujer',
  description:
    'Peluquería de mujer con precios claros y reserva online con disponibilidad en tiempo real.',
  // Esta web es una demo de portfolio (ADR-0036, ADR-0038).
  demo: {
    portfolioUrl: 'https://terryq.com/',
    repositoryUrl: 'https://github.com/Terryqg10/estudio-peluqueria',
    footerNotice: 'Proyecto de portfolio: el salón, los datos y las citas son ficticios; no se atiende ninguna cita real.',
  },
  contact: {
    address: 'Calle del Ejemplo 12, 28001 Madrid', // VERIFICAR: dirección ficticia
    phoneDisplay: '+34 600 000 000', // VERIFICAR: marcador, sustituir al publicar
    phoneHref: 'tel:+34600000000',
    whatsapp: '34600000000', // VERIFICAR: marcador (E.164 sin «+»), sustituir al publicar
    hours: [
      { days: 'Lunes a viernes', time: '10:00 – 20:00' }, // VERIFICAR
      { days: 'Sábado', time: '10:00 – 14:00' }, // VERIFICAR
      { days: 'Domingo', time: 'Cerrado' },
    ],
  },
} as const;
