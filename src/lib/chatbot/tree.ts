import { ROUTES } from '@/lib/routes';
import { SITE } from '@/lib/site';

// Árbol de decisiones del chat (RF-08, T-010). Son datos tipados, sin red y sin estado guardado: el componente
// solo recorre este árbol. Cada nodo responde con un texto y, a lo sumo, un enlace; «Volver al menú» lo pone el
// componente en todos los nodos que no son el menú.

export type ChatLink =
  | { kind: 'internal'; label: string; href: string }
  | { kind: 'whatsapp'; label: string }; // el enlace real se construye con el número del salón

export type ChatNodeId = 'menu' | 'reservar' | 'precios' | 'horarios' | 'humano';

export type ChatNode = {
  id: ChatNodeId;
  // Texto de la opción en el menú (no aplica al propio menú).
  option?: string;
  // Párrafos de la respuesta.
  reply: readonly string[];
  link?: ChatLink;
};

export const MENU_GREETING = `Hola, soy el asistente de ${SITE.name}. ¿En qué te puedo ayudar?`;

export const CHAT_TREE: readonly ChatNode[] = [
  {
    id: 'menu',
    reply: [MENU_GREETING],
  },
  {
    id: 'reservar',
    option: 'Reservar cita',
    reply: [
      'Puedes reservar tu cita en línea en un minuto: eliges el servicio, la estilista y una hora libre.',
    ],
    link: { kind: 'internal', label: 'Ir a reservar', href: ROUTES.reservar },
  },
  {
    id: 'precios',
    option: 'Ver precios',
    reply: ['Los precios «desde» de todos nuestros servicios están en la sección Servicios de la página de inicio.'],
    link: { kind: 'internal', label: 'Ver servicios y precios', href: `${ROUTES.home}#servicios` },
  },
  {
    id: 'horarios',
    option: 'Horarios',
    reply: [
      ...SITE.contact.hours.map((h) => `${h.days}: ${h.time}`),
      `Estamos en ${SITE.contact.address}. Teléfono: ${SITE.contact.phoneDisplay}.`,
    ],
    link: { kind: 'internal', label: 'Ver contacto', href: ROUTES.contacto },
  },
  {
    id: 'humano',
    option: 'Hablar con un humano',
    reply: ['Te atiende una persona del salón por WhatsApp. Se abre en una pestaña nueva.'],
    link: { kind: 'whatsapp', label: 'Abrir WhatsApp' },
  },
];

export const MENU_OPTIONS = CHAT_TREE.filter((n) => n.id !== 'menu');

export function getNode(id: ChatNodeId): ChatNode {
  const node = CHAT_TREE.find((n) => n.id === id);
  if (!node) throw new Error(`Nodo de chat desconocido: ${id}`);
  return node;
}
