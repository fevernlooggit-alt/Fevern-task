// Thin fetch wrapper. Same-origin (vite proxy in dev), session cookie included.

export interface ApiErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, envelope: ApiErrorEnvelope | null) {
    super(envelope?.error.message ?? `HTTP ${status}`);
    this.status = status;
    this.code = envelope?.error.code ?? 'unknown';
    this.details = envelope?.error.details;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let envelope: ApiErrorEnvelope | null = null;
    try {
      envelope = (await res.json()) as ApiErrorEnvelope;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, envelope);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};

/** WebSocket for realtime events, tenant-scoped. */
export function openRealtime(tenantSlug: string, onEvent: (ev: Record<string, unknown>) => void): () => void {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/realtime?tenant=${encodeURIComponent(tenantSlug)}`);
  ws.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data as string));
    } catch {
      /* ignore malformed frames */
    }
  };
  return () => ws.close();
}
