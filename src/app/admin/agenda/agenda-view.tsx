import Link from 'next/link';
import { formatDayParts, formatLongDate } from '@/lib/booking/dates';
import { ROUTES } from '@/lib/routes';
import { weekHref } from '@/lib/admin/week';
import type { AgendaAppointment, AgendaStylist } from '@/lib/admin/load-week-agenda';
import { AppointmentBlock } from './appointment-block';

type Props = {
  stylists: AgendaStylist[];
  appointments: AgendaAppointment[];
  days: string[];
  selectedDay: string;
  monday: string;
};

function forCell(appointments: AgendaAppointment[], stylistId: string, date: string) {
  return appointments.filter((a) => a.stylistId === stylistId && a.date === date);
}

// Con la semana vacía el aviso único lo da la página: aquí solo lo oyen los lectores de pantalla.
function Empty({ quiet }: { quiet: boolean }) {
  return <p className={quiet ? 'sr-only' : 'text-fg-muted'}>Sin citas</p>;
}

// Cuadrícula semanal (≥ 1280 px): filas = estilistas, columnas = días. En pantallas menores se oculta
// (display: none) y se usa la vista de un día.
function WeekGrid({ stylists, appointments, days }: Pick<Props, 'stylists' | 'appointments' | 'days'>) {
  const quiet = appointments.length === 0;
  return (
    <table data-view="week" className="hidden w-full table-fixed border-separate border-spacing-2 xl:table">
      <caption className="sr-only">Agenda de la semana por estilista</caption>
      <thead>
        <tr>
          <th scope="col" className="w-28 text-left">
            Estilista
          </th>
          {days.map((date) => {
            const { weekday, day, month } = formatDayParts(date);
            return (
              <th key={date} scope="col" className="text-left font-semibold">
                <span className="capitalize">{weekday}</span> {day} {month}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {stylists.map((stylist) => (
          <tr key={stylist.id} className="align-top">
            <th scope="row" className="text-left font-semibold">
              {stylist.name}
            </th>
            {days.map((date) => {
              const cell = forCell(appointments, stylist.id, date);
              return (
                <td key={date} className="rounded-card bg-surface-muted p-2">
                  <div className="space-y-2">
                    {cell.length === 0 ? <Empty quiet={quiet} /> : null}
                    {cell.map((a) => (
                      <AppointmentBlock key={a.id} appointment={a} />
                    ))}
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Vista de un día (< 1280 px): selector de día con enlaces reales y una sección por estilista.
function DayView({ stylists, appointments, days, selectedDay, monday }: Props) {
  const quiet = appointments.length === 0;
  return (
    <div data-view="day" className="xl:hidden">
      <nav aria-label="Días de la semana">
        <ul className="grid grid-cols-7 gap-1">
          {days.map((date) => {
            const { weekday, day } = formatDayParts(date);
            const selected = date === selectedDay;
            return (
              <li key={date}>
                <Link
                  href={weekHref(ROUTES.adminAgenda, monday, date)}
                  aria-current={selected ? 'date' : undefined}
                  className={`flex min-h-11 flex-col items-center justify-center rounded-card border px-1 py-1 transition-colors duration-(--duration-fast) ${
                    selected
                      ? 'border-accent bg-accent text-accent-fg'
                      : 'border-border-strong bg-surface text-fg hover:bg-surface-muted'
                  }`}
                >
                  <span className="text-sm capitalize">{weekday}</span>
                  <span className="font-semibold">{day}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <h2 className="mt-6 font-display text-2xl font-semibold first-letter:uppercase">
        {formatLongDate(selectedDay)}
      </h2>
      <div className="mt-4 space-y-6">
        {stylists.map((stylist) => {
          const cell = forCell(appointments, stylist.id, selectedDay);
          return (
            <section key={stylist.id} aria-label={stylist.name} className="rounded-container bg-surface p-4 shadow-card">
              <h3 className="font-semibold">{stylist.name}</h3>
              <div className="mt-3 space-y-2">
                {cell.length === 0 ? <Empty quiet={quiet} /> : null}
                {cell.map((a) => (
                  <AppointmentBlock key={a.id} appointment={a} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function AgendaView(props: Props) {
  return (
    <>
      <WeekGrid stylists={props.stylists} appointments={props.appointments} days={props.days} />
      <DayView {...props} />
    </>
  );
}
