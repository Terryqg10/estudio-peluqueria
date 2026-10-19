export type ServiceOption = {
  id: string;
  name: string;
  category: string;
  priceFromCents: number;
  durationMin: number;
};

export type StylistOption = {
  id: string;
  name: string;
  specialty: string | null;
};

// Datos que la página de reserva necesita para pintar el flujo.
export type BookingData = {
  services: ServiceOption[];
  stylists: StylistOption[];
  // Para cada servicio, las estilistas que lo hacen (ADR-0014).
  offers: Record<string, string[]>;
};
