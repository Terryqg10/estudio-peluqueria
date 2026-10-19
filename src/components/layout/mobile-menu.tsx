'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { BOOKING_CTA, type NavItem } from '@/lib/navigation';
import { SITE } from '@/lib/site';
import { useHashOverlay } from '@/lib/ui/use-hash-overlay';

const OPEN_HASH = '#menu-movil';
const CLOSE_HASH = '#cerrar-menu';

const FOCUSABLE = 'a[href], button:not([disabled])';

export function MobileMenu({ items }: { items: readonly NavItem[] }) {
  const { open, close } = useHashOverlay(OPEN_HASH, CLOSE_HASH);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const closeRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) {
        wasOpen.current = false;
        triggerRef.current?.focus();
      }
      return;
    }
    wasOpen.current = true;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const nodes = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = nodes.item(0);
      const last = nodes.item(nodes.length - 1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  return (
    <>
      <a
        ref={triggerRef}
        href={OPEN_HASH}
        aria-label="Abrir menú"
        aria-expanded={open}
        aria-controls="menu-movil"
        className="inline-flex size-11 items-center justify-center rounded-control text-fg transition-colors duration-(--duration-fast) hover:bg-accent-soft lg:hidden"
      >
        <Menu aria-hidden="true" className="size-6" />
      </a>

      <div
        id="menu-movil"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menú principal"
        className="fixed inset-0 z-50 hidden flex-col bg-bg target:flex lg:target:hidden"
      >
        <div className="flex h-(--nav-height) items-center justify-between px-(--layout-gutter)">
          <span className="font-semibold text-fg">{SITE.name}</span>
          <a
            ref={closeRef}
            href={CLOSE_HASH}
            aria-label="Cerrar menú"
            className="inline-flex size-11 items-center justify-center rounded-control text-fg transition-colors duration-(--duration-fast) hover:bg-accent-soft"
          >
            <X aria-hidden="true" className="size-6" />
          </a>
        </div>
        <nav aria-label="Principal" className="flex flex-col gap-2 px-(--layout-gutter) pt-6">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={close}
              className="flex min-h-11 items-center rounded-tile px-3 py-3 text-2xl font-semibold text-fg transition-colors duration-(--duration-fast) hover:bg-accent-soft hover:text-accent-text"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href={BOOKING_CTA.href}
            onClick={close}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-6 text-xl font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover"
          >
            {BOOKING_CTA.label}
          </Link>
        </nav>
        {/* Clic fuera: el resto del panel cierra el menú. */}
        <a href={CLOSE_HASH} tabIndex={-1} aria-hidden="true" className="flex-1" />
      </div>
    </>
  );
}
