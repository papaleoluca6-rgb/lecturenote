const pad = (n: number) => String(n).padStart(2, '0')

/** 75 → "01:15", 3700 → "1:01:40" */
export function fmtSecs(total: number): string {
  const s = Math.max(0, Math.floor(total || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}
