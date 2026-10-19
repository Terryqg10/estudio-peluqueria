import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileMenu } from '@/components/layout/mobile-menu';
import { NAV_ITEMS } from '@/lib/navigation';

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

function setHash(hash: string) {
  window.location.hash = hash;
  act(() => {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('MobileMenu', () => {
  beforeEach(() => {
    window.location.hash = '';
  });
  afterEach(() => {
    window.location.hash = '';
  });

  it('el disparador es un enlace con hash específico (funciona sin JS)', () => {
    render(<MobileMenu items={NAV_ITEMS} />);
    const trigger = screen.getByRole('link', { name: 'Abrir menú' });
    expect(trigger).toHaveAttribute('href', '#menu-movil');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('refleja el estado abierto desde el hash y mueve el foco al botón de cerrar', () => {
    render(<MobileMenu items={NAV_ITEMS} />);
    setHash('#menu-movil');
    expect(screen.getByRole('link', { name: 'Abrir menú' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('link', { name: 'Cerrar menú' })).toHaveFocus();
  });

  it('se cierra con Esc y devuelve el foco al disparador', () => {
    render(<MobileMenu items={NAV_ITEMS} />);
    setHash('#menu-movil');
    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(window.location.hash).toBe('#cerrar-menu');
    expect(screen.getByRole('link', { name: 'Abrir menú' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('link', { name: 'Abrir menú' })).toHaveFocus();
  });

  it('el botón de cerrar y la zona de fuera apuntan a un hash de cierre', () => {
    render(<MobileMenu items={NAV_ITEMS} />);
    const closers = document.querySelectorAll('a[href="#cerrar-menu"]');
    expect(closers.length).toBeGreaterThanOrEqual(2);
  });

  it('todos los enlaces del menú tienen destino real', () => {
    render(<MobileMenu items={NAV_ITEMS} />);
    for (const item of NAV_ITEMS) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', item.href);
    }
  });
});
