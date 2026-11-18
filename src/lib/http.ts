/** POST JSON con timeout ed errori leggibili in italiano (rete bloccata, CORS, chiave errata, …). */
export async function postJson<T>(url: string, headers: Record<string, string>, body: unknown, timeoutMs = 20000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error(`Timeout: nessuna risposta in ${timeoutMs / 1000} s`)
    throw new Error(`Server non raggiungibile (rete bloccata, DNS o CORS): ${(e as Error).message}`)
  } finally {
    clearTimeout(timer)
  }
  const text = await res.text()
  if (!res.ok) {
    let msg = text.slice(0, 200)
    try {
      const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
      msg = (typeof j.error === 'string' ? j.error : j.error?.message) ?? j.message ?? msg
    } catch {
      /* risposta non JSON: si usa il testo */
    }
    const hint = res.status === 401 || res.status === 403 ? ' (chiave errata o non autorizzata)' : ''
    throw new Error(`HTTP ${res.status}${hint}: ${msg}`)
  }
  return JSON.parse(text) as T
}
