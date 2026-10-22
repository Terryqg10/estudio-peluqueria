'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ROUTES } from '@/lib/routes';
import { saveServiceAction, type ServiceFormState } from './actions';

type Props = {
  id: string | null;
  initial: { name: string; category: string; price: string; duration: string; active: boolean; stylistIds: string[] };
  stylists: { id: string; name: string }[];
  categories: string[];
  futureAppointments: number | null;
};

const FIELD_CLASS =
  'min-h-11 w-full rounded-card border border-border bg-surface px-4 py-2 text-fg placeholder:text-fg-muted';

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1 text-accent-text">
      {message}
    </p>
  ) : null;
}

// Formulario de servicio (T-009a). Funciona sin JavaScript (acción de servidor); con JS conserva lo escrito
// cuando hay un error.
export function ServiceForm({ id, initial, stylists, categories, futureAppointments }: Props) {
  const [state, action, pending] = useActionState<ServiceFormState, FormData>(saveServiceAction, null);
  const values = state?.values ?? initial;
  const errors = state?.fieldErrors ?? {};

  return (
    <form action={action} className="mt-8 space-y-8" noValidate>
      {id ? <input type="hidden" name="id" value={id} /> : null}

      {state?.error ? (
        <p role="alert" className="rounded-card bg-accent-soft p-4 text-fg">
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor="name" className="font-semibold">
          Nombre
        </label>
        <input
          id="name"
          name="name"
          defaultValue={values.name}
          required
          maxLength={80}
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'name-error' : undefined}
          className={`mt-2 ${FIELD_CLASS}`}
        />
        <FieldError id="name-error" message={errors.name} />
      </div>

      <div>
        <label htmlFor="category" className="font-semibold">
          Categoría
        </label>
        <input
          id="category"
          name="category"
          list="categorias"
          defaultValue={values.category}
          required
          maxLength={40}
          autoComplete="off"
          aria-invalid={errors.category ? true : undefined}
          aria-describedby={errors.category ? 'category-error' : undefined}
          className={`mt-2 ${FIELD_CLASS}`}
        />
        <datalist id="categorias">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <FieldError id="category-error" message={errors.category} />
      </div>

      <div className="grid gap-8 sm:grid-cols-2">
        <div>
          <label htmlFor="price" className="font-semibold">
            Precio «desde» (€)
          </label>
          <input
            id="price"
            name="price"
            inputMode="decimal"
            defaultValue={values.price}
            required
            placeholder="45"
            aria-invalid={errors.price ? true : undefined}
            aria-describedby={errors.price ? 'price-error' : undefined}
            className={`mt-2 ${FIELD_CLASS}`}
          />
          <FieldError id="price-error" message={errors.price} />
        </div>
        <div>
          <label htmlFor="duration" className="font-semibold">
            Duración (minutos)
          </label>
          <input
            id="duration"
            name="duration"
            inputMode="numeric"
            defaultValue={values.duration}
            required
            placeholder="60"
            aria-invalid={errors.duration ? true : undefined}
            aria-describedby={errors.duration ? 'duration-error' : undefined}
            className={`mt-2 ${FIELD_CLASS}`}
          />
          <FieldError id="duration-error" message={errors.duration} />
        </div>
      </div>

      <fieldset>
        <legend className="font-semibold">Estilistas que lo hacen</legend>
        <p className="mt-1 text-fg-muted">Sin ninguna, el servicio no se ofrece en la reserva.</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {stylists.map((s) => (
            <li key={s.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-border bg-surface px-4 has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-accent-fg">
                <input
                  type="checkbox"
                  name="stylists"
                  value={s.id}
                  defaultChecked={values.stylistIds.includes(s.id)}
                  className="size-4 accent-accent"
                />
                {s.name}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div>
        <label className="flex min-h-11 items-center gap-3 font-semibold">
          <input type="checkbox" name="active" defaultChecked={values.active} className="size-5 accent-accent" />
          Activo (se ofrece en la web)
        </label>
        {id && futureAppointments !== null && futureAppointments > 0 ? (
          <p className="mt-1 text-fg-muted">
            Tiene {futureAppointments} {futureAppointments === 1 ? 'cita futura' : 'citas futuras'}: si lo desactivas,
            se mantienen.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-6 font-semibold text-accent-fg transition-colors duration-(--duration-fast) hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? 'Guardando…' : 'Guardar'}
        </button>
        <Link
          href={ROUTES.adminServicios}
          className="inline-flex min-h-11 items-center justify-center rounded-control px-4 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
