import { getApiBaseUrl } from "./apiConfig";

const TOKEN_KEY = "tmap_api_token_v1";

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const base = getApiBaseUrl();
  if (!base) throw new Error("VITE_API_BASE_URL is not set");

  const { json: jsonBody, body, ...rest } = init ?? {};
  const headers = new Headers(rest.headers);
  if (jsonBody !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    ...rest,
    headers,
    body: jsonBody !== undefined ? JSON.stringify(jsonBody) : body,
  });

  const text = await res.text();
  if (!res.ok) {
    let message = `${res.status} ${text.slice(0, 200)}`;
    try {
      const j = JSON.parse(text) as { error?: string };
      const errStr = (j?.error ?? "").trim();
      if (
        res.status === 503 &&
        /GEMINI_API_KEY|not configured/i.test(errStr)
      ) {
        message =
          "백엔드에 GEMINI_API_KEY가 설정되어 있지 않습니다. tmap_web_be 프로젝트의 .env(또는 실행 환경)에 GEMINI_API_KEY를 넣고 Node 서버를 재시작하세요. (프론트 .env가 아니라 백엔드 쪽입니다.)";
      } else if (errStr) {
        message = `${res.status}: ${errStr}`;
      }
    } catch {
      /* body is not JSON — keep default message */
    }
    throw new ApiError(message, res.status, text);
  }
  if (res.status === 204) return undefined as T;
  return (text ? JSON.parse(text) : undefined) as T;
}
