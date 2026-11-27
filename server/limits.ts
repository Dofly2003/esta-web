// Penghitung kegagalan (rate limit login) di memori per instance.
// Jendela tetap per kunci: dihitung dari kegagalan pertama dan TIDAK diperpanjang oleh percobaan saat sudah diblokir.
// Memori dibatasi: entri kedaluwarsa disapu berkala, dan bila kunci masih lebih dari maxKeys (mis. serangan dari
// banyak IP) entri tertua dibuang dulu (urutan sisip Map = urutan kedaluwarsa, karena jendelanya sama panjang).

type Entry = { n: number; until: number };

export class FailWindow {
  private entries = new Map<string, Entry>();
  private lastSweep = 0;

  constructor(
    private windowMs: number,
    private maxKeys = 10_000,
    private sweepEveryMs = 60_000,
  ) {}

  /** Sudah mencapai `limit` kegagalan dalam jendela yang masih berlaku */
  blocked(key: string, limit: number, now = Date.now()) {
    const e = this.entries.get(key);
    return !!e && e.n >= limit && e.until > now;
  }

  /** Catat satu kegagalan (tidak lebih dari `limit`) */
  fail(key: string, limit: number, now = Date.now()) {
    this.sweep(now);
    const e = this.entries.get(key);
    if (!e || e.until < now) {
      this.entries.delete(key);
      this.entries.set(key, { n: 1, until: now + this.windowMs });
    } else if (e.n < limit) {
      e.n++;
    }
    while (this.entries.size > this.maxKeys) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear(key: string) {
    this.entries.delete(key);
  }

  get size() {
    return this.entries.size;
  }

  private sweep(now: number) {
    if (now - this.lastSweep < this.sweepEveryMs) return;
    this.lastSweep = now;
    for (const [k, e] of this.entries) if (e.until < now) this.entries.delete(k);
  }
}
