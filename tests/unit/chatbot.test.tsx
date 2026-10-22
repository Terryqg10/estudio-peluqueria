import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chatbot } from '@/components/chatbot/chatbot';
import { CHAT_TREE, MENU_OPTIONS, getNode } from '@/lib/chatbot/tree';
import { WHATSAPP_GREETING, buildWhatsappUrl } from '@/lib/chatbot/whatsapp';
import { SITE } from '@/lib/site';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// jsdom no implementa <dialog> modal: se imita lo mínimo (abrir, cerrar y el evento `close`).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

beforeEach(() => {
  pathname = '/';
});
afterEach(() => {
  vi.restoreAllMocks();
});

const NUMBER = '34600000000';

function openChat(whatsappNumber: string | null = NUMBER) {
  render(<Chatbot whatsappNumber={whatsappNumber} />);
  fireEvent.click(screen.getByRole('button', { name: 'Abrir chat de ayuda' }));
  return screen.getByRole('dialog', { name: 'Chat de ayuda' });
}

describe('árbol del chat (CA-22)', () => {
  it('el menú ofrece exactamente las 4 opciones de la spec', () => {
    expect(MENU_OPTIONS.map((o) => o.option)).toEqual(['Reservar cita', 'Ver precios', 'Horarios', 'Hablar con un humano']);
  });

  it('todos los nodos tienen respuesta y los ids son únicos', () => {
    const ids = CHAT_TREE.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const node of CHAT_TREE) expect(node.reply.length).toBeGreaterThan(0);
    expect(() => getNode('menu')).not.toThrow();
  });

  it('«Horarios» usa los datos del salón', () => {
    const text = getNode('horarios').reply.join(' ');
    for (const h of SITE.contact.hours) expect(text).toContain(h.time);
    expect(text).toContain(SITE.contact.address);
  });

  it('«Ver precios» y «Reservar cita» enlazan a páginas del sitio', () => {
    expect(getNode('precios').link).toMatchObject({ kind: 'internal', href: '/#servicios' });
    expect(getNode('reservar').link).toMatchObject({ kind: 'internal', href: '/reservar' });
  });
});

describe('enlace de WhatsApp (CA-23)', () => {
  it('construye un wa.me válido con el texto codificado', () => {
    const url = buildWhatsappUrl(NUMBER);
    expect(url).toBe(`https://wa.me/${NUMBER}?text=${encodeURIComponent(WHATSAPP_GREETING)}`);
    expect(new URL(url ?? '').host).toBe('wa.me');
  });

  it('codifica el texto aunque lleve caracteres especiales', () => {
    const url = buildWhatsappUrl(NUMBER, 'Hola & «adiós» ?x=1');
    expect(url).toContain('%26');
    expect(url).not.toContain(' ');
    expect(new URL(url ?? '').searchParams.get('text')).toBe('Hola & «adiós» ?x=1');
  });

  it('rechaza números ausentes o no válidos', () => {
    for (const bad of [undefined, null, '', '+34600000000', '34 600 000 000', '0600000000', '123', 'abc', '1'.repeat(16)]) {
      expect(buildWhatsappUrl(bad), String(bad)).toBeNull();
    }
  });

  it('el número de la semilla es válido', () => {
    expect(buildWhatsappUrl(SITE.contact.whatsapp)).not.toBeNull();
  });
});

describe('Chatbot (CA-21, CA-22, CA-23, CA-24)', () => {
  it('muestra el botón flotante con nombre accesible y abre un diálogo con nombre', () => {
    render(<Chatbot whatsappNumber={NUMBER} />);
    const button = screen.getByRole('button', { name: 'Abrir chat de ayuda' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button.className).toContain('fixed');
    expect(button.className).toContain('bottom-4');
    expect(button.className).toContain('right-4');

    fireEvent.click(button);
    const dialog = screen.getByRole('dialog', { name: 'Chat de ayuda' });
    expect(dialog).toHaveAttribute('open');
    expect(within(dialog).getAllByRole('button', { name: /Reservar cita|Ver precios|Horarios|Hablar con un humano/ })).toHaveLength(4);
  });

  it('cada opción da su respuesta y siempre hay «Volver al menú», que devuelve al saludo', () => {
    const dialog = openChat();
    for (const option of MENU_OPTIONS) {
      fireEvent.click(within(dialog).getByRole('button', { name: option.option }));
      for (const paragraph of option.reply) expect(within(dialog).getByText(paragraph)).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Volver al menú' }));
      expect(within(dialog).getByText(getNode('menu').reply[0] ?? '')).toBeInTheDocument();
      expect(within(dialog).getAllByRole('button', { name: /Reservar cita|Ver precios|Horarios|Hablar con un humano/ })).toHaveLength(4);
    }
  });

  it('el foco pasa a la respuesta al elegir una opción', () => {
    const dialog = openChat();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Horarios' }));
    expect(dialog.querySelector('[data-node="horarios"]')).toHaveFocus();
  });

  it('«Hablar con un humano» abre wa.me en pestaña nueva con rel seguro', () => {
    const dialog = openChat();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hablar con un humano' }));
    const link = within(dialog).getByRole('link', { name: 'Abrir WhatsApp' });
    expect(link).toHaveAttribute('href', buildWhatsappUrl(NUMBER));
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('sin número de WhatsApp válido el botón se deshabilita y se ofrece el teléfono del salón', () => {
    for (const number of [null, '', '+34600000000']) {
      const { unmount } = render(<Chatbot whatsappNumber={number} />);
      fireEvent.click(screen.getByRole('button', { name: 'Abrir chat de ayuda' }));
      const dialog = screen.getByRole('dialog', { name: 'Chat de ayuda' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Hablar con un humano' }));
      expect(within(dialog).getByRole('button', { name: 'Abrir WhatsApp' })).toBeDisabled();
      expect(within(dialog).queryByRole('link', { name: 'Abrir WhatsApp' })).toBeNull();
      expect(within(dialog).getByRole('link', { name: SITE.contact.phoneDisplay })).toHaveAttribute(
        'href',
        SITE.contact.phoneHref,
      );
      unmount();
    }
  });

  it('«Reservar cita» y «Ver precios» ofrecen su enlace y cierran el chat al seguirlo', () => {
    const dialog = openChat();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reservar cita' }));
    const link = within(dialog).getByRole('link', { name: 'Ir a reservar' });
    expect(link).toHaveAttribute('href', '/reservar');
    link.addEventListener('click', (event) => event.preventDefault()); // jsdom no navega
    fireEvent.click(link);
    expect(dialog).not.toHaveAttribute('open');
  });

  it('el botón de cerrar cierra el diálogo y devuelve el foco al botón flotante', () => {
    const dialog = openChat();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar el chat' }));
    expect(dialog).not.toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Abrir chat de ayuda' })).toHaveFocus();
  });

  it('un clic en el fondo cierra; un clic dentro no', () => {
    const dialog = openChat();
    fireEvent.click(within(dialog).getByText('Chat de ayuda'));
    expect(dialog).toHaveAttribute('open');
    fireEvent.click(dialog);
    expect(dialog).not.toHaveAttribute('open');
  });

  it('reabrir empieza siempre por el menú', () => {
    const dialog = openChat();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ver precios' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar el chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir chat de ayuda' }));
    expect(within(dialog).getAllByRole('button', { name: /Reservar cita|Ver precios|Horarios|Hablar con un humano/ })).toHaveLength(4);
  });

  it('no se muestra en el panel de administración, pero sí en el resto', () => {
    for (const path of ['/admin', '/admin/agenda', '/admin/servicios/nuevo']) {
      pathname = path;
      const hidden = render(<Chatbot whatsappNumber={NUMBER} />);
      expect(screen.queryByRole('button', { name: 'Abrir chat de ayuda' }), path).toBeNull();
      hidden.unmount();
    }

    for (const path of ['/', '/reservar', '/contacto', '/administracion-falsa', '/cita/abc']) {
      pathname = path;
      const view = render(<Chatbot whatsappNumber={NUMBER} />);
      const visible = screen.queryByRole('button', { name: 'Abrir chat de ayuda' }) !== null;
      view.unmount();
      expect(visible, path).toBe(true);
    }
  });

  it('no usa almacenamiento ni red', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const dialog = openChat();
    for (const option of MENU_OPTIONS) {
      fireEvent.click(within(dialog).getByRole('button', { name: option.option }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Volver al menú' }));
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe('');
  });
});
