// Antrean aksi offline (outbox). Aksi dikirim ulang saat online. Server tetap menjadi sumber kebenaran:
// aksi bersifat idempoten (complete dua kali tidak memberi XP dua kali), sehingga aman dikirim ulang.

export type OutboxOpType = 'complete' | 'skip' | 'notes';

export interface OutboxOp {
  key: string;               // kunci dedupe: `${type}:${instanceId}`
  type: OutboxOpType;
  instanceId: string;
  payload?: { notes?: string };
  queuedAt: number;
}

export interface OutboxStorage {
  load(): Promise<OutboxOp[]>;
  save(ops: OutboxOp[]): Promise<void>;
}

export type FlushOutcome = 'ok' | 'network-error' | 'rejected';

export interface FlushReport {
  sent: number;
  rejected: Array<{ op: OutboxOp; reason: string }>;
  remaining: number;
}

export class Outbox {
  constructor(private readonly storage: OutboxStorage, private readonly now: () => number = Date.now) {}

  async list(): Promise<OutboxOp[]> {
    return this.storage.load();
  }

  async size(): Promise<number> {
    return (await this.storage.load()).length;
  }

  /** Menambahkan aksi. Aturan penggabungan:
   *  - op yang sama untuk instance yang sama menggantikan yang lama (notes terbaru menang)
   *  - complete menghapus skip yang menunggu (selesai lebih kuat dari lewati)
   *  - skip diabaikan bila complete sudah menunggu */
  async enqueue(type: OutboxOpType, instanceId: string, payload?: OutboxOp['payload']): Promise<void> {
    let ops = await this.storage.load();
    if (type === 'skip' && ops.some((o) => o.type === 'complete' && o.instanceId === instanceId)) return;
    if (type === 'complete') ops = ops.filter((o) => !(o.type === 'skip' && o.instanceId === instanceId));
    const key = `${type}:${instanceId}`;
    ops = ops.filter((o) => o.key !== key);
    ops.push({ key, type, instanceId, payload, queuedAt: this.now() });
    await this.storage.save(ops);
  }

  /** Mengirim semua aksi berurutan. `send` mengembalikan 'ok' | 'network-error' | 'rejected'.
   *  Network error menghentikan proses (aksi tersisa tetap antre); 'rejected' membuang aksi dan melaporkannya. */
  async flush(send: (op: OutboxOp) => Promise<{ outcome: FlushOutcome; reason?: string }>): Promise<FlushReport> {
    const ops = await this.storage.load();
    const report: FlushReport = { sent: 0, rejected: [], remaining: 0 };
    const keep: OutboxOp[] = [];
    let stopped = false;
    for (const op of ops) {
      if (stopped) { keep.push(op); continue; }
      const res = await send(op);
      if (res.outcome === 'ok') report.sent++;
      else if (res.outcome === 'rejected') report.rejected.push({ op, reason: res.reason ?? 'ditolak server' });
      else { keep.push(op); stopped = true; }
    }
    await this.storage.save(keep);
    report.remaining = keep.length;
    return report;
  }
}

export class MemoryOutboxStorage implements OutboxStorage {
  private ops: OutboxOp[] = [];
  async load() { return [...this.ops]; }
  async save(ops: OutboxOp[]) { this.ops = [...ops]; }
}
