import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getSession } from './api';

describe('api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getSession returns status on 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ status: 'waiting', host_name: 'Ada' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    );
    const res = await getSession('abc123');
    expect(res.status).toBe('waiting');
    expect(res.host_name).toBe('Ada');
  });

  it('getSession throws ApiError with ROOM_NOT_FOUND', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ detail: { error: 'ROOM_NOT_FOUND' } }), {
            status: 404,
          }),
        ),
      ),
    );
    await expect(getSession('missing')).rejects.toBeInstanceOf(ApiError);
    await expect(getSession('missing')).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' });
  });
});