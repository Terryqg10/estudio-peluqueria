'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { MENU_OPTIONS, getNode, type ChatNodeId } from '@/lib/chatbot/tree';
import { buildWhatsappUrl } from '@/lib/chatbot/whatsapp';
import { SITE } from '@/lib/site';

type Props = {
  // Número de WhatsApp del salón (E.164 sin «+»). Si falta o no es válido, el botón queda deshabilitado.
  whatsappNumber: string | null;
};

const CTA_CLASS =
  'inline-flex min-h-11 w-full items-center justify-center rounded-control bg-accent px-5 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover';
const OPTION_CLASS =
  'inline-flex min-h-11 w-full items-center justify-start rounded-control border border-border bg-surface px-5 text-left text-fg transition-colors duration-(--duration-fast) hover:bg-surface-muted';
const GHOST_CLASS =
  'inline-flex min-h-11 w-full items-center justify-center rounded-control px-5 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft';

// Chat de reglas (RF-08, T-010): botón flotante y diálogo nativo modal. No guarda ni envía nada: solo recorre el
// árbol de `CHAT_TREE`. Esc y el clic fuera cierran, y el foco vuelve al botón.
export function Chatbot({ whatsappNumber }: Props) {
  const pathname = usePathname();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const replyRef = useRef<HTMLDivElement>(null);
  const [nodeId, setNodeId] = useState<ChatNodeId>('menu');

  // Al cambiar de respuesta el botón pulsado desaparece: el foco pasa a la respuesta nueva.
  useEffect(() => {
    if (nodeId !== 'menu') replyRef.current?.focus();
  }, [nodeId]);

  // El chat es para las clientas: no se muestra en el panel de administración.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return null;

  const node = getNode(nodeId);
  const whatsappUrl = buildWhatsappUrl(whatsappNumber);

  function open() {
    setNodeId('menu');
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Abrir chat de ayuda"
        aria-haspopup="dialog"
        onClick={open}
        className="fixed bottom-4 right-4 z-40 inline-flex size-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-card transition-colors duration-(--duration-fast) hover:bg-accent-hover"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
        </svg>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => buttonRef.current?.focus()}
        onClick={(event) => {
          // Un clic en el fondo (fuera del contenido) llega con el propio <dialog> como destino.
          if (event.target === dialogRef.current) close();
        }}
        className="fixed inset-x-4 bottom-20 top-auto m-0 ml-auto h-auto w-auto max-w-sm overflow-y-auto rounded-container border-0 bg-surface p-0 text-fg shadow-card backdrop:bg-fg/30"
      >
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="font-display text-xl font-semibold">
              Chat de ayuda
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar el chat"
              className="inline-flex size-11 items-center justify-center rounded-full text-fg-muted transition-colors duration-(--duration-fast) hover:bg-surface-muted"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>

          <div
            ref={replyRef}
            tabIndex={-1}
            aria-live="polite"
            data-node={node.id}
            className="mt-4 space-y-2 rounded-card bg-surface-muted p-4 outline-offset-2"
          >
            {node.reply.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            {node.id === 'menu' ? (
              <ul className="space-y-2">
                {MENU_OPTIONS.map((option) => (
                  <li key={option.id}>
                    <button type="button" onClick={() => setNodeId(option.id)} className={OPTION_CLASS}>
                      {option.option}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {node.link?.kind === 'internal' ? (
                  <Link href={node.link.href} onClick={close} className={CTA_CLASS}>
                    {node.link.label}
                  </Link>
                ) : null}
                {node.link?.kind === 'whatsapp' ? (
                  whatsappUrl ? (
                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={CTA_CLASS}>
                      {node.link.label}
                    </a>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled
                        className={`${CTA_CLASS} cursor-not-allowed opacity-60 hover:bg-accent`}
                      >
                        {node.link.label}
                      </button>
                      <p className="text-fg-muted">
                        Ahora mismo no podemos abrir WhatsApp. Llámanos al{' '}
                        <a href={SITE.contact.phoneHref} className="text-accent-text">
                          {SITE.contact.phoneDisplay}
                        </a>
                        .
                      </p>
                    </>
                  )
                ) : null}
                <button type="button" onClick={() => setNodeId('menu')} className={GHOST_CLASS}>
                  Volver al menú
                </button>
              </>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
