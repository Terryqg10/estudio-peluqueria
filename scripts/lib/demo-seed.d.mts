export const FIRST_DAY_OFFSET: number;
export const LAST_DAY_OFFSET: number;

export type SampleService = { id: string; name: string; durationMin: number };
export type SampleStylist = { id: string; name: string; services: SampleService[] };

export type SampleAppointment = {
  stylistId: string;
  serviceId: string;
  date: string;
  time: string;
  minutes: number;
  status: 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  name: string;
  phone: string;
  email: string;
  note: string | null;
};

export function madridToUtcIso(date: string, time: string): string;
export function planSampleAppointments(input: { today: string; stylists: SampleStylist[] }): SampleAppointment[];
