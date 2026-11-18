/** Tiene lo schermo acceso durante la registrazione e riprende il lock quando la pagina torna visibile. */
export class ScreenWakeLock {
  private lock: WakeLockSentinel | null = null
  private wanted = false

  private onVisibility = () => {
    if (document.visibilityState === 'visible' && this.wanted) void this.request()
  }

  get active(): boolean {
    return !!this.lock && !this.lock.released
  }

  async acquire(): Promise<void> {
    this.wanted = true
    document.addEventListener('visibilitychange', this.onVisibility)
    await this.request()
  }

  release(): void {
    this.wanted = false
    document.removeEventListener('visibilitychange', this.onVisibility)
    void this.lock?.release().catch(() => {})
    this.lock = null
  }

  private async request(): Promise<void> {
    if (!('wakeLock' in navigator) || this.active) return
    try {
      this.lock = await navigator.wakeLock.request('screen')
    } catch {
      // Non supportato o rifiutato (es. risparmio energetico): la registrazione continua comunque.
      this.lock = null
    }
  }
}
