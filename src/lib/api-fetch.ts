/** Headers that help ngrok free-tier not return an HTML interstitial for API fetches. */
const API_HEADERS: HeadersInit = {
  "ngrok-skip-browser-warning": "true",
};

export async function apiFetch(input: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(API_HEADERS)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
