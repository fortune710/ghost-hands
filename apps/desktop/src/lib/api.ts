import { API_BASE_URL } from './config';

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface CreateSessionResponse {
  session_id: string;
  code: string;
  display_code: string;
  join_url: string;
  host_token: string;
  expires_at: string;
  max_pointers: number;
  ice_servers: IceServerConfig[];
  ice_ttl_s: number;
}

export async function createSession(opts: {
  host_name?: string;
  auto_admit?: boolean;
}): Promise<CreateSessionResponse> {
  const res = await fetch(`${API_BASE_URL}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      host_name: opts.host_name,
      auto_admit: opts.auto_admit,
      client: { app_version: '0.1.0', os: 'web' },
    }),
  });
  if (!res.ok) {
    throw new Error(`createSession failed: ${res.status}`);
  }
  return res.json() as Promise<CreateSessionResponse>;
}

export async function endSession(code: string, hostToken: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/v1/sessions/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${hostToken}` },
  });
}
