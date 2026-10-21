// JSON request that throws the server's Korean error message on failure.
export async function requestJson<T>(path: string, init?: { method: string; body?: unknown }) {
  let response: { ok: boolean; json(): Promise<unknown> };
  try {
    response = await fetch(path, {
      method: init?.method,
      headers: init?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new Error('서버에 연결할 수 없습니다');
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? '요청을 처리하지 못했습니다');
  return data as T;
}
