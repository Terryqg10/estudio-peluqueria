'use server';

import { getAvailability } from '@/lib/availability/get-availability';
import { findNextDaysWithSlots } from '@/lib/availability/next-days';
import type { NextDaysResult } from '@/lib/availability/next-days';
import type { AvailabilityResult } from '@/lib/availability/schema';

// Acciones de servidor de la reserva. La entrada llega del navegador, así que se valida
// con Zod dentro de cada función (RNF-02); aquí solo se exponen.
export async function loadAvailabilityAction(input: unknown): Promise<AvailabilityResult> {
  return getAvailability(input);
}

export async function loadNextDaysAction(input: unknown): Promise<NextDaysResult> {
  return findNextDaysWithSlots(input);
}
