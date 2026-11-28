import { normalizeCode } from '@ghost-hands/protocol';
import { apiBaseUrl } from './config';

export interface SessionStatusResponse {
  status: string;
  host_name: string | null;
}

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

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function parseApiError(res: Response): Promise<ApiError> {
  let code = 'HTTP_ERROR';
  try {
    const body = (await res.json()) as { detail?: { error?: string; msg?: string } | string };
    if (typeof body.detail === 'object' && body.detail?.error) {
      code = body.detail.error;
    } else if (typeof body.detail === 'string') {
      code = body.detail;
    }
  } catch {
    /* ignore */
  }
  return new ApiError(res.status, code);
}

export async function getSession(code: string): Promise<SessionStatusResponse> {
  const norm = normalizeCode(code);
  const res = await fetch(`${apiBaseUrl()}/api/v1/sessions/${encodeURIComponent(norm)}`);
  if (!res.ok) throw await parseApiError(res);
  return res.json() as Promise<SessionStatusResponse>;
}

export interface CreateSessionOptions {
  host_name?: string;
  auto_admit?: boolean;
}

export async function createSession(
  opts: CreateSessionOptions = {},
): Promise<CreateSessionResponse> {
  const res = await fetch(`${apiBaseUrl()}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      host_name: opts.host_name,
      auto_admit: opts.auto_admit,
    }),
  });
  if (!res.ok) throw await parseApiError(res);
  return res.json() as Promise<CreateSessionResponse>;
}