export interface PointerPeerHandle {
  pc: RTCPeerConnection;
  poseChannel: RTCDataChannel;
  ctrlChannel: RTCDataChannel;
  setRemoteAnswer: (sdp: RTCSessionDescriptionInit) => Promise<void>;
  addIce: (candidate: RTCIceCandidateInit | null) => Promise<void>;
  close: () => void;
  getStats: () => Promise<RTCStatsReport>;
}

export interface CreatePointerPeerOptions {
  iceServers: RTCIceServer[];
  onLocalIce: (candidate: RTCIceCandidateInit | null) => void;
  onCtrlMessage: (data: string | ArrayBuffer) => void;
}

function assertNoMediaTracks(pc: RTCPeerConnection): void {
  const bad = pc.getSenders().some((s) => s.track !== null);
  if (bad) {
    throw new Error('RTCPeerConnection must not attach media tracks');
  }
  const transceivers = pc.getTransceivers?.() ?? [];
  for (const tr of transceivers) {
    if (tr.sender.track !== null || tr.receiver.track !== null) {
      throw new Error('RTCPeerConnection must not use media transceivers');
    }
  }
}

export function createPointerPeer(opts: CreatePointerPeerOptions): PointerPeerHandle {
  const pc = new RTCPeerConnection({ iceServers: opts.iceServers });

  const poseChannel = pc.createDataChannel('pose', {
    ordered: false,
    maxRetransmits: 0,
  });
  const ctrlChannel = pc.createDataChannel('ctrl');

  ctrlChannel.onmessage = (ev) => {
    opts.onCtrlMessage(ev.data as string | ArrayBuffer);
  };

  pc.onicecandidate = (ev) => {
    opts.onLocalIce(ev.candidate ? ev.candidate.toJSON() : null);
  };

  assertNoMediaTracks(pc);

  return {
    pc,
    poseChannel,
    ctrlChannel,
    async setRemoteAnswer(sdp) {
      await pc.setRemoteDescription(sdp);
      assertNoMediaTracks(pc);
    },
    async addIce(candidate) {
      if (candidate?.candidate) {
        await pc.addIceCandidate(candidate);
      }
    },
    close() {
      try {
        poseChannel.close();
      } catch {
        /* ignore */
      }
      try {
        ctrlChannel.close();
      } catch {
        /* ignore */
      }
      try {
        pc.close();
      } catch {
        /* ignore */
      }
    },
    getStats() {
      return pc.getStats();
    },
  };
}