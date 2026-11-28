import { describe, expect, it } from 'vitest';
import { Rest, Signaling } from './generated/index.js';

/**
 * Lightweight TS contract: generated REST/signaling types export the M2 shapes.
 * Full wire contract is covered by backend pytest + live smoke.
 */
describe('REST generated types (M2)', () => {
  it('CreateSessionResponse fields are typed', () => {
    const sample: Rest.CreateSessionResponse = {
      session_id: 'ses_x',
      code: 'KX492P',
      display_code: 'KX4-92P',
      join_url: 'https://ghosthands.fortunealebiosu.dev/join/KX4-92P',
      host_token: 'tok',
      expires_at: '2026-11-27T08:10:00Z',
      max_pointers: 1,
      ice_servers: [{ urls: ['stun:stun.cloudflare.com:3478'] }],
      ice_ttl_s: 3600,
    };
    expect(sample.code).toHaveLength(6);
    expect(sample.ice_ttl_s).toBe(3600);
  });

  it('IceServersResponse fields are typed', () => {
    const sample: Rest.IceServersResponse = {
      ice_servers: [{ urls: 'stun:stun.example:3478' }],
      ice_ttl_s: 3600,
    };
    expect(sample.ice_servers.length).toBe(1);
  });
});

describe('Signaling generated types (M2)', () => {
  it('host auth + pointer join + approved shapes compile', () => {
    const auth: Signaling.HostAuth = { t: 'auth', host_token: 'x', proto: 1 };
    const join: Signaling.PointerJoin = {
      t: 'join',
      name: 'Ada',
      color: '#4FC3F7',
      proto: 1,
    };
    const approved: Signaling.Approved = {
      t: 'approved',
      peer: 'p_abc',
      pointer_token: 'tok',
      ice_servers: [],
      ice_ttl_s: 3600,
    };
    expect(auth.t).toBe('auth');
    expect(join.t).toBe('join');
    expect(approved.t).toBe('approved');
  });
});
