export function isLocalUrl(value: unknown): boolean;

export type Seed = { stylists: string[]; services: string[] };
export function parseSeed(sql: string): Seed;

export type Snapshot = {
  stylists: string[];
  services: string[];
  appointments: number;
  timeBlocks: number;
  deletionRequests: number;
  profiles: number;
  authUsers: number;
};
export function findLeftovers(snapshot: Snapshot, seed: Seed): string[];
