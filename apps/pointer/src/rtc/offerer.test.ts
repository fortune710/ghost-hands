import { describe, expect, it, vi } from 'vitest';
import { createPointerPeer } from './offerer';

const hasRtc = typeof globalThis.RTCPeerConnection !== 'undefined';

describe.skipIf(!hasRtc)('createPointerPeer', () => {
  it('creates pose + ctrl channels without media tracks', () => {
    const onIce = vi.fn();
    const peer = createPointerPeer({
      iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
      onLocalIce: onIce,
      onCtrlMessage: () => {},
    });
    expect(peer.poseChannel.label).toBe('pose');
    expect(peer.ctrlChannel.label).toBe('ctrl');
    expect(peer.pc.getSenders().every((s) => s.track === null)).toBe(true);
    peer.close();
  });
});

describe('createPointerPeer (mocked)', () => {
  it('wires data channels on a mocked peer connection', () => {
    if (hasRtc) return;

    class MockDataChannel {
      label: string;
      readyState = 'open';
      onmessage: ((ev: { data: unknown }) => void) | null = null;
      constructor(label: string) {
        this.label = label;
      }
      close() {}
      send() {}
    }

    const poseCh = new MockDataChannel('pose');
    const ctrlCh = new MockDataChannel('ctrl');
    const pc = {
      createDataChannel: vi.fn((label: string) =>
        label === 'pose' ? poseCh : ctrlCh,
      ),
      getSenders: () => [],
      getTransceivers: () => [],
      onicecandidate: null as ((ev: { candidate: null }) => void) | null,
      setRemoteDescription: vi.fn(),
      addIceCandidate: vi.fn(),
      close: vi.fn(),
      getStats: vi.fn(() => Promise.resolve({})),
    };

    vi.stubGlobal(
      'RTCPeerConnection',
      vi.fn(() => pc),
    );

    const peer = createPointerPeer({
      iceServers: [],
      onLocalIce: () => {},
      onCtrlMessage: () => {},
    });
    expect(pc.createDataChannel).toHaveBeenCalledWith('pose', {
      ordered: false,
      maxRetransmits: 0,
    });
    expect(pc.createDataChannel).toHaveBeenCalledWith('ctrl');
    expect(peer.poseChannel).toBe(poseCh);
    peer.close();
    vi.unstubAllGlobals();
  });
});