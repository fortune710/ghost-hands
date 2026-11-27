import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * Transparent overlay entry — RTCPeerConnection + jitter buffer + renderer mount in M3.
 * M0: empty transparent canvas that proves the webview paints with alpha.
 */
function OverlayApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      // Status pill scaffold (top-right) — still click-through at the OS level
      ctx.fillStyle = 'rgba(15, 20, 25, 0.55)';
      const w = 220;
      const h = 28;
      const x = window.innerWidth - w - 16;
      const y = 16;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 14);
      ctx.fill();
      ctx.fillStyle = '#e8eef4';
      ctx.font = '12px ui-sans-serif, system-ui';
      ctx.fillText('Waiting for pointer…', x + 14, y + 18);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        background: 'transparent',
      }}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>,
);
