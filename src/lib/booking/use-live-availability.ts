'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadAvailabilityAction } from '@/app/reservar/actions';
import { getBrowserClient } from '@/lib/supabase/browser-client';
import { isRelevantMessage, pollIntervalMs } from './live';
import type { Slot } from './slots';

export type LiveParams = {
  serviceId: string;
  stylistId: string | null; // null = cualquiera
  date: string; // YYYY-MM-DD en Europe/Madrid
  stylistIds: readonly string[]; // estilistas que se están mostrando (para filtrar avisos)
};

export type LoadStatus = 'loading' | 'ready' | 'error';
export type ChannelState = 'connecting' | 'live' | 'fallback';

type Loaded = { key: string; slots: Slot[]; status: 'ready' | 'error' };

const keyOf = (p: Pick<LiveParams, 'serviceId' | 'stylistId' | 'date'>) =>
  `${p.serviceId}|${p.stylistId ?? 'any'}|${p.date}`;

// Disponibilidad en vivo (ADR-0013): carga por acción de servidor, avisos por el canal
// `availability`, nueva consulta al suscribirse y sondeo de respaldo (15 s sin canal, 60 s con él).
export function useLiveAvailability(params: LiveParams | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [channel, setChannel] = useState<ChannelState>(() =>
    getBrowserClient() ? 'connecting' : 'fallback',
  );
  const paramsRef = useRef<LiveParams | null>(params);
  const requestRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    paramsRef.current = params;
  });

  const refetch = useCallback(async () => {
    const current = paramsRef.current;
    if (!current) return;
    const requestId = ++requestRef.current;
    const key = keyOf(current);
    const result = await loadAvailabilityAction({
      serviceId: current.serviceId,
      date: current.date,
      ...(current.stylistId ? { stylistId: current.stylistId } : {}),
    });
    if (requestId !== requestRef.current) return; // respuesta obsoleta: otra consulta es más reciente
    if (result.ok) setLoaded({ key, slots: result.slots, status: 'ready' });
    else setLoaded({ key, slots: [], status: 'error' }); // no se muestran huecos desactualizados
  }, []);

  const currentKey = params ? keyOf(params) : null;

  // Consulta al cambiar servicio, estilista o día.
  useEffect(() => {
    if (currentKey) void refetch();
  }, [currentKey, refetch]);

  // Suscripción al canal público (sin datos personales). Al estar activo se vuelve a consultar:
  // un aviso emitido justo antes de suscribirse podría perderse.
  useEffect(() => {
    const client = getBrowserClient();
    if (!client) return;

    const scheduleRefetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void refetch(), 250);
    };

    const realtime = client
      .channel('availability')
      .on('broadcast', { event: 'availability_changed' }, (message: { payload: unknown }) => {
        const current = paramsRef.current;
        if (!current) return;
        if (isRelevantMessage(message.payload, { date: current.date, stylistIds: current.stylistIds })) {
          scheduleRefetch();
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setChannel('live');
          void refetch();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setChannel('fallback');
        }
      });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void client.removeChannel(realtime);
    };
  }, [refetch]);

  // Sondeo de respaldo: garantiza el máximo de latencia aunque falle el canal (CA-07, N = 15 s).
  const enabled = currentKey !== null;
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => void refetch(), pollIntervalMs(channel === 'live'));
    return () => clearInterval(id);
  }, [enabled, channel, refetch]);

  const fresh = loaded !== null && loaded.key === currentKey;
  const status: LoadStatus = !fresh ? 'loading' : loaded.status;
  const slots: Slot[] = fresh ? loaded.slots : [];

  return { slots, status, channel, refresh: refetch };
}
