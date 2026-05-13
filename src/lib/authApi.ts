import type { AuthUser } from "@/types";
import { apiFetch, getAuthToken, setAuthToken } from "./http";

export type MeUser = {
  id: string;
  email: string | null;
  name: string | null;
  pictureUrl: string | null;
};

export function meToAuthUser(u: MeUser): AuthUser {
  return {
    id: u.id,
    email: u.email ?? "",
    name: u.name ?? "",
    ...(u.pictureUrl ? { picture: u.pictureUrl } : {}),
  };
}

export async function apiAuthGoogle(credential: string): Promise<{
  token: string;
  user: AuthUser;
}> {
  const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "");
  if (!base) throw new Error("VITE_API_BASE_URL is not set");

  const res = await fetch(`${base}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j?.error) detail = j.error;
    } catch {
      /* use raw */
    }
    throw new Error(
      res.status === 0 || res.status >= 500
        ? `서버 오류 (${res.status}): ${detail}. 백엔드 로그와 GEMINI/DB 설정을 확인하세요.`
        : `로그인 실패 (${res.status}): ${detail}`,
    );
  }
  const data = JSON.parse(text) as { token: string; user: MeUser };
  setAuthToken(data.token);
  return { token: data.token, user: meToAuthUser(data.user) };
}

export async function apiGetMe(): Promise<AuthUser> {
  const u = await apiFetch<MeUser>("/me");
  return meToAuthUser(u);
}

export async function apiLogout(): Promise<void> {
  const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "");
  if (!base) return;
  const token = getAuthToken();
  try {
    await fetch(`${base}/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    /* ignore */
  }
}

