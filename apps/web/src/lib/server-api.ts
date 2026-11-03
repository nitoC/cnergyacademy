import 'server-only';
import { cookies } from 'next/headers';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/** Server-component fetch to the API, forwarding the visitor's cookies. Never cached. */
export async function serverGet<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const jar = await cookies();
  try {
    const res = await fetch(`${API}/api/v1${path}`, {
      headers: { cookie: jar.toString(), accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 503 };
  }
}
