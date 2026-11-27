export * from './hand.js';
export * from './ink.js';

import { InkLayer } from './ink.js';

export class OverlayRenderer {
  readonly ink: InkLayer;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    ink?: InkLayer,
  ) {
    this.ink = ink ?? new InkLayer();
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    const ctx = this.canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const w = this.canvas.clientWidth || this.canvas.width;
    const h = this.canvas.clientHeight || this.canvas.height;
    ctx.clearRect(0, 0, w, h);
  }
}
