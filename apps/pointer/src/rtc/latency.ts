/**
 * Rolling local latency samples (ms).
 *
 * M2 hook: time from encode/send scheduling to the local "render" mark on the
 * pointer (same tab). True glass-to-glass needs a sharer-side timestamp (M3+).
 */

const MAX_SAMPLES = 120;

export class PoseLatencyTracker {
  private readonly samples: number[] = [];
  private readonly pending = new Map<number, number>();

  /** Mark just before the pose bytes are sent on the DataChannel. */
  recordSend(seq: number, _tCaptureMs?: number): void {
    this.pending.set(seq, performance.now());
  }

  /** Mark when the local pipeline considers the frame "rendered" / handed off. */
  recordRender(seq: number): void {
    const t0 = this.pending.get(seq);
    if (t0 === undefined) return;
    this.pending.delete(seq);
    const latency = performance.now() - t0;
    if (!Number.isFinite(latency) || latency < 0) return;
    this.samples.push(latency);
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.shift();
    }
  }

  getP50Ms(): number {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1]! + sorted[mid]!) / 2;
    }
    return sorted[mid]!;
  }
}
