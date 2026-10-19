'use client';

import { useCallback, useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/**
 * Sincroniza el estado de un overlay con el hash de la URL. El overlay se
 * muestra por CSS (`:target`), de modo que funciona sin JavaScript; este hook
 * añade el estado para aria, foco y cierre con Esc.
 *
 * `closeHash` debe ser un hash sin elemento asociado: así `:target` deja de
 * coincidir y el overlay se oculta, sin saltos de scroll.
 */
export function useHashOverlay(openHash: string, closeHash: string) {
  const open = useSyncExternalStore(
    subscribe,
    () => window.location.hash === openHash,
    () => false,
  );

  const close = useCallback(() => {
    if (window.location.hash === openHash) {
      window.location.replace(closeHash);
    }
  }, [openHash, closeHash]);

  return { open, close };
}
