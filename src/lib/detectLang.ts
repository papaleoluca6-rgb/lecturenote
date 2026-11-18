/** Lingua prevalente di un testo zh/en: una parola cinese ≈ 1,7 caratteri, una inglese ≈ 4,5 lettere. */
export function detectLang(text: string): 'zh' | 'en' {
  const cjk = (text.match(/[\u3400-\u9fff]/g) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  return cjk > 0 && cjk * 2.5 >= latin ? 'zh' : 'en'
}
