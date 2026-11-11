// JSON request that throws the server's English error message on failure.
export async function requestJson<T>(path: string, init?: { method: string; body?: unknown }) {
  let response: { ok: boolean; json(): Promise<unknown> };
  try {
    response = await fetch(path, {
      method: init?.method,
      headers: init?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new Error('Cannot reach the server');
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? 'The request could not be processed');
  return data as T;
}
