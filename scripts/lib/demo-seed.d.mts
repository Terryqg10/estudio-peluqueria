export const FIRST_DAY_OFFSET: number;
export const LAST_DAY_OFFSET: number;
export const SAMPLE_NOTE_MARK: string;

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

export type SampleBlock = {
  stylistId: string;
  kind: 'vacation' | 'block';
  startsAt: string;
  endsAt: string;
  note: string;
};
export function planSampleBlocks(input: { today: string; stylists: { id: string }[] }): SampleBlock[];
