'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { AvailabilitySlot } from '@/lib/availability/schema';
import { CONSENT_TEXT } from '@/lib/booking/consent';
import { BookingFormSchema, toFieldErrors, type FieldErrors } from '@/lib/booking/schema';
import { ROUTES } from '@/lib/routes';
import { createBookingAction } from './actions';

type Props = {
  serviceId: string;
  stylistId: string;
  startsAt: string;
  values: ContactValues;
  onValuesChange: (values: ContactValues) => void;
  onSlotUnavailable: (alternatives: AvailabilitySlot[]) => void;
  // Reserva con cuenta (T-021): el email es el de la cuenta y no se edita (el servidor lo fuerza igualmente).
  emailLocked?: boolean;
};

const INPUT_CLASS =
  'min-h-11 w-full rounded-tile border border-border-strong bg-surface px-4 text-fg placeholder:text-fg-muted aria-invalid:border-danger';

export type ContactValues = { name: string; email: string; phone: string; consent: boolean; website: string };

export const EMPTY_CONTACT: ContactValues = { name: '', email: '', phone: '', consent: false, website: '' };

// Datos de la invitada (RF-04, CA-10, CA-25). Valida con el mismo esquema Zod que el servidor
// y deja el honeypot (ADR-0016) fuera de la vista y de la accesibilidad.
export function BookingForm({
  serviceId,
  stylistId,
  startsAt,
  values,
  onValuesChange,
  onSlotUnavailable,
  emailLocked = false,
}: Props) {
  const router = useRouter();
  const formId = useId();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);

  const id = (field: string) => `${formId}-${field}`;

  function focusFirst(fieldErrors: FieldErrors) {
    if (fieldErrors.name) nameRef.current?.focus();
    else if (fieldErrors.email) emailRef.current?.focus();
    else if (fieldErrors.phone) phoneRef.current?.focus();
    else if (fieldErrors.consent) consentRef.current?.focus();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setMessage(null);

    const input = { serviceId, stylistId, startsAt, ...values };
    const local = BookingFormSchema.safeParse(input);
    if (!local.success) {
      const fieldErrors = toFieldErrors(local.error);
      setErrors(fieldErrors);
      focusFirst(fieldErrors);
      return;
    }
    setErrors({});

    setPending(true);
    try {
      const result = await createBookingAction(input);
      if (result.ok) {
        router.push(ROUTES.reservarConfirmada);
        return;
      }
      if (result.error === 'INVALID_INPUT') {
        setErrors(result.fieldErrors);
        focusFirst(result.fieldErrors);
      } else if (result.error === 'SLOT_TAKEN') {
        onSlotUnavailable(result.alternatives);
      } else if (result.error === 'OUT_OF_WINDOW') {
        onSlotUnavailable([]);
      } else if (result.error === 'LIMIT_EMAIL') {
        setMessage(
          'Ya tienes el máximo de citas activas con este email. Cancela una desde el enlace de tu email o contacta con el salón.',
        );
      } else if (result.error === 'LIMIT_IP') {
        setMessage(
          'Hemos recibido demasiadas reservas desde tu conexión. Inténtalo de nuevo más tarde o contacta con el salón.',
        );
      } else {
        setMessage('No hemos podido completar la reserva. Inténtalo de nuevo en unos minutos.');
      }
    } catch {
      setMessage('No hemos podido completar la reserva. Inténtalo de nuevo en unos minutos.');
    } finally {
      setPending(false);
    }
  }

  function set<K extends keyof ContactValues>(key: K, value: ContactValues[K]) {
    onValuesChange({ ...values, [key]: value });
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-labelledby={id('titulo')} className="mt-8 space-y-5">
      <h4 id={id('titulo')} className="font-display text-xl font-semibold">
        Tus datos
      </h4>
      {emailLocked ? (
        <p role="status" className="text-fg-muted">
          Reservas con tu cuenta: usamos el email de tu cuenta y puedes ver la cita en «Mis citas».
        </p>
      ) : null}

      {message ? (
        <div role="alert" className="rounded-card bg-accent-soft p-4 text-fg">
          <p>{message}</p>
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={id('name')} className="font-semibold">
            Nombre
          </label>
          <input
            ref={nameRef}
            id={id('name')}
            name="name"
            type="text"
            autoComplete="name"
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? id('name-error') : undefined}
            className={`mt-1 ${INPUT_CLASS}`}
          />
          {errors.name ? (
            <p id={id('name-error')} className="mt-1 text-danger">
              {errors.name}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor={id('email')} className="font-semibold">
            Email
          </label>
          <input
            ref={emailRef}
            id={id('email')}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => set('email', e.target.value)}
            readOnly={emailLocked}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? id('email-error') : undefined}
            className={`mt-1 ${INPUT_CLASS}`}
          />
          {errors.email ? (
            <p id={id('email-error')} className="mt-1 text-danger">
              {errors.email}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor={id('phone')} className="font-semibold">
            Teléfono
          </label>
          <input
            ref={phoneRef}
            id={id('phone')}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={values.phone}
            onChange={(e) => set('phone', e.target.value)}
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={errors.phone ? id('phone-error') : undefined}
            className={`mt-1 ${INPUT_CLASS}`}
          />
          {errors.phone ? (
            <p id={id('phone-error')} className="mt-1 text-danger">
              {errors.phone}
            </p>
          ) : null}
        </div>
      </div>

      {/* Honeypot (ADR-0016): fuera de la vista y de la accesibilidad; una persona no lo rellena. */}
      <div aria-hidden="true">
        <label className="sr-only">
          No rellenar este campo
          {/* Ancho mínimo: aunque no se vea, no debe sobresalir del viewport (responsive). */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={values.website}
            onChange={(e) => set('website', e.target.value)}
            className="w-4"
          />
        </label>
      </div>

      <div>
        <label htmlFor={id('consent')} className="flex min-h-11 cursor-pointer items-start gap-3">
          <input
            ref={consentRef}
            id={id('consent')}
            name="consent"
            type="checkbox"
            checked={values.consent}
            onChange={(e) => set('consent', e.target.checked)}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? id('consent-error') : undefined}
            className="mt-1 size-6 shrink-0 accent-accent"
          />
          <span>{CONSENT_TEXT}</span>
        </label>
        {errors.consent ? (
          <p id={id('consent-error')} className="mt-1 text-danger">
            {errors.consent}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center rounded-control bg-accent px-8 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? 'Reservando…' : 'Confirmar reserva'}
      </button>
    </form>
  );
}
