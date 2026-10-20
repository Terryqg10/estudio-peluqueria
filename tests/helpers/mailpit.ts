import { statusEnv } from './supabase-admin';

// Lectura de la bandeja local (Mailpit, incluido en Supabase local) para los e2e de T-006a.
export type ReceivedEmail = { subject: string; text: string; html: string; linkPath: string | null };

const base = () => statusEnv().MAILPIT_URL;

const LINK_RE = /https?:\/\/[^\s"'<>]+(\/cita\/[A-Za-z0-9_-]+)/;

type SearchResult = { messages?: { ID: string }[] };
type MessageResult = { Subject: string; Text: string; HTML: string };

// Espera (con sondeo) a que llegue un correo a esa dirección; devuelve el último.
export async function waitForEmail(to: string, timeoutMs = 15_000): Promise<ReceivedEmail> {
  const query = encodeURIComponent(`to:${to}`);
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const found = (await fetch(`${base()}/api/v1/search?query=${query}`).then((r) => r.json())) as SearchResult;
    const id = found.messages?.[0]?.ID;
    if (id) {
      const message = (await fetch(`${base()}/api/v1/message/${id}`).then((r) => r.json())) as MessageResult;
      const match = LINK_RE.exec(message.Text) ?? LINK_RE.exec(message.HTML);
      return {
        subject: message.Subject,
        text: message.Text,
        html: message.HTML,
        linkPath: match?.[1] ?? null,
      };
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No llegó ningún correo a ${to} en ${timeoutMs} ms`);
}

export async function emailCountTo(to: string): Promise<number> {
  const query = encodeURIComponent(`to:${to}`);
  const found = (await fetch(`${base()}/api/v1/search?query=${query}`).then((r) => r.json())) as SearchResult;
  return found.messages?.length ?? 0;
}

export async function deleteEmailsTo(to: string): Promise<void> {
  const query = encodeURIComponent(`to:${to}`);
  await fetch(`${base()}/api/v1/search?query=${query}`, { method: 'DELETE' });
}

// Enlace de acceso (T-007, ADR-0021): ruta relativa `/acceso/confirmar?token_hash=…` del correo de
// Auth. Se lee del texto plano, donde el `&` no va codificado.
const LOGIN_LINK_RE = /https?:\/\/[^\s"'<>]+(\/acceso\/confirmar\?token_hash=[A-Za-z0-9_-]+(?:&|&amp;)type=email)/;

export async function waitForLoginPath(to: string, timeoutMs = 15_000): Promise<string> {
  const query = encodeURIComponent(`to:${to}`);
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const found = (await fetch(`${base()}/api/v1/search?query=${query}`).then((r) => r.json())) as SearchResult;
    // Los resultados llegan del más reciente al más antiguo: se usa el último enviado.
    const id = found.messages?.[0]?.ID;
    if (id) {
      const message = (await fetch(`${base()}/api/v1/message/${id}`).then((r) => r.json())) as MessageResult;
      const match = LOGIN_LINK_RE.exec(message.Text) ?? LOGIN_LINK_RE.exec(message.HTML);
      if (match?.[1]) return match[1].replace('&amp;', '&');
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No llegó ningún enlace de acceso a ${to} en ${timeoutMs} ms`);
}
