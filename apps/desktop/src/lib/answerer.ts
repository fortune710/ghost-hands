import type { IceServerConfig } from './api';

export interface AnswererHandle {
  pc: RTCPeerConnection;
  handleOffer: (sdp: RTCSessionDescriptionInit) => Promise<RTCSessionDescriptionInit>;
  addIce: (candidate: RTCIceCandidateInit | null) => Promise<void>;
  close: () => void;
}

export interface CreateAnswererOptions {
  iceServers: IceServerConfig[];
  onLocalIce: (candidate: RTCIceCandidateInit | null) => void;
  onPose: (data: ArrayBuffer) => void;
  onCtrl: (data: string) => void;
}

/** WebRTC answerer for the sharer overlay — receives pose/ctrl DataChannels from the pointer. */
export function createAnswerer(opts: CreateAnswererOptions): AnswererHandle {
  const pc = new RTCPeerConnection({ iceServers: opts.iceServers as RTCIceServer[] });

  pc.ondatachannel = (ev) => {
    const ch = ev.channel;
    if (ch.label === 'pose') {
      ch.binaryType = 'arraybuffer';
      ch.onmessage = (msg) => {
        opts.onPose(msg.data as ArrayBuffer);
      };
    }
    if (ch.label === 'ctrl') {
      ch.onmessage = (msg) => {
        opts.onCtrl(String(msg.data));
      };
    }
  };

  pc.onicecandidate = (ev) => {
    opts.onLocalIce(ev.candidate ? ev.candidate.toJSON() : null);
  };

  return {
    pc,
    async handleOffer(sdp) {
      await pc.setRemoteDescription(sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      return pc.localDescription ?? answer;
    },
    async addIce(candidate) {
      if (candidate?.candidate) {
        await pc.addIceCandidate(candidate);
      }
    },
    close() {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
    },
  };
}
