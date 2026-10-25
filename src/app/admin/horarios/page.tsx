import type { Metadata } from "next";
import Link from "next/link";
import { requirePanel } from "@/lib/account/require-admin";
import {
  WEEKDAYS,
  ScopeSchema,
  loadSchedule,
  loadStylistsForSchedules,
} from "@/lib/admin/schedules";
import { ROUTES } from "@/lib/routes";
import { ReadOnlyScope } from "@/components/admin/read-only-scope";
import { AdminTwoColumns, SummaryCard } from "@/components/admin/two-columns";
import { ScheduleForm } from "./schedule-form";

export const metadata: Metadata = { title: "Horarios" };
export const dynamic = "force-dynamic";

const LINK_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-control px-4 text-accent-text transition-colors duration-(--duration-fast) hover:bg-accent-soft";
const PILL_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-control border px-5 transition-colors duration-(--duration-fast)";

type SearchParams = Promise<{ quien?: string; aviso?: string }>;

export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const admin = await requirePanel(); // un layout no basta (ADR-0022)
  const query = await searchParams;
  const scopes = await loadStylistsForSchedules(admin.client);

  if (scopes === "error") {
    return (
      <section className="max-w-3xl">
        <h1 className="font-display text-display font-semibold">Horarios</h1>
        <div
          role="alert"
          className="mt-6 rounded-card bg-accent-soft p-4 text-fg"
        >
          <p>No hemos podido cargar los horarios.</p>
          <Link href={ROUTES.adminHorarios} className={`${LINK_CLASS} mt-2`}>
            Reintentar
          </Link>
        </div>
      </section>
    );
  }

  const parsed = ScopeSchema.safeParse(query.quien);
  const requested = parsed.success ? parsed.data : "salon";
  // Un id que no es de una estilista activa vuelve al salón.
  const scope =
    requested === "salon" || scopes.stylists.some((s) => s.id === requested)
      ? requested
      : "salon";
  // «del salón» / «de Irene Solís»
  const label =
    scope === "salon"
      ? "del salón"
      : `de ${scopes.stylists.find((s) => s.id === scope)?.name ?? ""}`;
  const initial = await loadSchedule(admin.client, scope);

  const options = [{ id: "salon", name: "Salón" }, ...scopes.stylists];

  // Resumen del horario guardado (no del que se está editando): un renglón por día, «Cerrado» si no hay tramos.
  const summary =
    initial === "error"
      ? null
      : WEEKDAYS.map((name, i) => ({
          label: name,
          value:
            initial
              .filter((r) => r.weekday === i + 1)
              .map((r) => `${r.starts}–${r.ends}`)
              .join(" · ") || "Cerrado",
        }));

  return (
    <AdminTwoColumns
      aside={
        summary ? (
          <SummaryCard title="Resumen guardado" items={summary} />
        ) : null
      }
    >
      <section className="max-w-3xl">
        <h1 className="font-display text-display font-semibold">Horarios</h1>
        <p className="mt-3 text-fg-muted">
          Los huecos que se ofrecen son los que caen dentro del horario del
          salón y del de la estilista a la vez.
        </p>

        {query.aviso === "guardado" ? (
          <p
            role="status"
            className="mt-4 rounded-card bg-accent-soft p-4 font-semibold text-fg"
          >
            Horario guardado.
          </p>
        ) : null}

        <nav aria-label="Horario de" className="mt-6">
          <ul className="flex flex-wrap gap-2">
            {options.map((o) => (
              <li key={o.id}>
                <Link
                  href={`${ROUTES.adminHorarios}?quien=${o.id}`}
                  aria-current={o.id === scope ? "page" : undefined}
                  className={`${PILL_CLASS} ${
                    o.id === scope
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border bg-surface text-fg hover:bg-surface-muted"
                  }`}
                >
                  {o.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <h2 className="mt-10 font-display text-2xl font-semibold first-letter:uppercase">
          Horario {label}
        </h2>
        {initial === "error" ? (
          <div
            role="alert"
            className="mt-4 rounded-card bg-accent-soft p-4 text-fg"
          >
            <p>No hemos podido cargar este horario.</p>
            <Link
              href={`${ROUTES.adminHorarios}?quien=${scope}`}
              className={`${LINK_CLASS} mt-2`}
            >
              Reintentar
            </Link>
          </div>
        ) : (
          <ReadOnlyScope readOnly={admin.readOnly}>
            <ScheduleForm
              key={scope}
              scope={scope}
              scopeLabel={label}
              initial={initial}
            />
          </ReadOnlyScope>
        )}
      </section>
    </AdminTwoColumns>
  );
}
