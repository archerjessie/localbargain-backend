const BASE_URL = process.env.SAM_LOCAL_URL ?? 'http://localhost:3000';

export async function call(method: string, path: string, opts: { as?: string; body?: unknown } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(opts.as ? { 'x-debug-sub': opts.as } : {}),
      ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}
