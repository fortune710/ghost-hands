import type { PoseFrame } from '@ghost-hands/protocol';
import { decodePose, encodePose } from '@ghost-hands/protocol';
import type { PipelineCtrlEvent } from '../tracking/posePipeline';

export const HARNESS_CHANNEL = 'ghost-hands-harness-v1';

export type HarnessCtrlPayload = PipelineCtrlEvent;

export type HarnessOutbound =
  | { kind: 'pose'; bytes: ArrayBuffer }
  | { kind: 'ctrl'; payload: HarnessCtrlPayload }
  | { kind: 'hello'; name: string; color: string };

export type HarnessInbound = HarnessOutbound;

export function openHarnessChannel(): BroadcastChannel {
  return new BroadcastChannel(HARNESS_CHANNEL);
}

export function publishPose(channel: BroadcastChannel, frame: PoseFrame): void {
  const bytes = encodePose(frame);
  // BroadcastChannel structured-clone needs a plain ArrayBuffer copy
  const copy = new Uint8Array(bytes).buffer;
  channel.postMessage({ kind: 'pose', bytes: copy } satisfies HarnessOutbound);
}

export function publishCtrl(
  channel: BroadcastChannel,
  payload: HarnessCtrlPayload,
): void {
  channel.postMessage({ kind: 'ctrl', payload } satisfies HarnessOutbound);
}

export function parseHarnessMessage(data: unknown): {
  pose?: PoseFrame;
  ctrl?: HarnessCtrlPayload;
  hello?: { name: string; color: string };
} {
  if (!data || typeof data !== 'object') return {};
  const msg = data as HarnessInbound;
  if (msg.kind === 'pose') {
    try {
      return { pose: decodePose(msg.bytes) };
    } catch {
      return {};
    }
  }
  if (msg.kind === 'ctrl') return { ctrl: msg.payload };
  if (msg.kind === 'hello') return { hello: { name: msg.name, color: msg.color } };
  return {};
}
