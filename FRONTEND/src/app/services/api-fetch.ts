import { API_URL } from '../api-config';

let refreshInProgress: Promise<boolean> | null = null;

function isProtectedApiRequest(input: RequestInfo | URL): boolean {
  const requestUrl = input instanceof Request
    ? input.url
    : input instanceof URL
      ? input.href
      : input;
  const path = new URL(requestUrl, window.location.href).pathname;
  return /^\/api\/(auth\/me|auth\/sessions|session|movimientos|balance|account|contador\/pendientes|depositos\/contador)/.test(path);
}

async function renewSession(): Promise<boolean> {
  if (!refreshInProgress) {
    refreshInProgress = fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include'
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshInProgress = null;
      });
  }
  return refreshInProgress;
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  headers.delete('Authorization');
  const options: RequestInit = { ...init, headers, credentials: 'include' };
  let response = await fetch(input, options);

  if (response.status !== 401 || !isProtectedApiRequest(input)) {
    return response;
  }

  if (!await renewSession()) {
    localStorage.removeItem('user');
    localStorage.removeItem('bankData');
    if (window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
    return response;
  }

  response = await fetch(input, options);
  return response;
}