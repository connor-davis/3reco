export interface ErrorBody {
  code: string;
  message: string;
  fields: Record<string, string> | null;
}

export class ApiError extends Error implements ErrorBody {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string> | null;
  readonly retryAfter: string | null;

  constructor(status: number, body: ErrorBody, retryAfter: string | null) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.fields = body.fields;
    this.retryAfter = retryAfter;
  }
}

export async function apiResponse(path: string, init: RequestInit = {}) {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
  });
  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => null)) as Partial<ErrorBody> | null;
    const error = new ApiError(
      response.status,
      {
        code: body?.code ?? 'error',
        message: body?.message ?? 'The request could not be completed.',
        fields: body?.fields ?? null,
      },
      response.headers.get('Retry-After')
    );

    // Auth bootstrap treats a missing session as signed out. Other callers
    // notify the provider so later private queries cannot keep stale data.
    if (response.status === 401 && path !== '/auth/me') {
      window.dispatchEvent(new Event('api:unauthorized'));
    }
    throw error;
  }
  return response;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiResponse(path, init);
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}

export function json(method: string, body?: unknown): RequestInit {
  return {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  };
}

export function upload(file: File): RequestInit {
  const body = new FormData();
  body.set('file', file);
  return { method: 'POST', body };
}

export async function download(path: string, filename: string) {
  const response = await apiResponse(path);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
