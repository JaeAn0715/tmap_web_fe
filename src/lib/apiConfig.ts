/** Base URL for tmap_web_be (e.g. http://127.0.0.1:3001). No trailing slash. */
export function getApiBaseUrl(): string | null {
  const v = import.meta.env.VITE_API_BASE_URL;
  if (typeof v !== "string" || !v.trim()) return null;
  return v.replace(/\/+$/, "");
}

export function apiMode(): boolean {
  return getApiBaseUrl() !== null;
}
