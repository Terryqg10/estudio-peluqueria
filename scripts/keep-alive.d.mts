export const KEEP_ALIVE_TABLES: string[];

export type KeepAliveResult = { table: string; ok: boolean; detail: string };

export function runKeepAlive(
  env: { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string },
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>,
): Promise<{ ok: boolean; error?: string; results: KeepAliveResult[] }>;
