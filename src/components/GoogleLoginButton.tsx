import { useEffect, useRef } from "react";

import { pullAllMeData } from "@/lib/bootstrapMe";
import { apiMode } from "@/lib/apiConfig";
import { apiAuthGoogle } from "@/lib/authApi";
import { clearAuthToken } from "@/lib/http";
import { useStore } from "@/store/useStore";

let gsiScriptPromise: Promise<void> | null = null;

function loadGsiScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).google?.accounts?.id) return Promise.resolve();
  if (!gsiScriptPromise) {
    gsiScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Google Identity Services failed to load"));
      document.head.appendChild(s);
    });
  }
  return gsiScriptPromise;
}

interface Props {
  /** Called when opening profile (e.g. ensure mobile side panel is open). */
  onOpenProfile?: () => void;
}

export function GoogleLoginButton({ onOpenProfile }: Props) {
  const user = useStore((s) => s.user);
  const signIn = useStore((s) => s.signIn);
  const bumpClusterList = useStore((s) => s.bumpClusterList);
  const openProfileView = useStore((s) => s.openProfileView);
  const gsiHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!apiMode() || user) return;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || !gsiHostRef.current) return;

    let cancelled = false;

    void (async () => {
      try {
        await loadGsiScript();
        if (cancelled || !gsiHostRef.current) return;

        // Avoid stacking duplicate buttons on StrictMode re-runs.
        gsiHostRef.current.innerHTML = "";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const google = (window as any).google;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: async (resp: { credential?: string }) => {
            const credential = resp?.credential;
            if (!credential) return;
            try {
              const { user: u } = await apiAuthGoogle(credential);
              signIn(u);
              await pullAllMeData();
              bumpClusterList();
            } catch (e) {
              console.error(e);
              clearAuthToken();
              const msg =
                e instanceof Error
                  ? e.message
                  : "Google 로그인에 실패했습니다.";
              // eslint-disable-next-line no-alert
              alert(
                `${msg}\n\n확인: (1) 백엔드 실행 중 (2) tmap_web_be .env에 GOOGLE_CLIENT_ID가 비어 있지 않은지 — 프론트 VITE_GOOGLE_CLIENT_ID와 동일한 OAuth Web 클라이언트 ID (3) Google Cloud Console에 자바스크립트 출처 http://localhost:5173 등 등록 (4) CORS_ORIGIN에 프론트 주소 포함`,
              );
            }
          },
        });
        google.accounts.id.renderButton(gsiHostRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          locale: "ko",
        });
      } catch (e) {
        console.error(e);
      }
    })();

    return () => {
      cancelled = true;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).google?.accounts?.id?.cancel();
      } catch {
        // ignore
      }
    };
  }, [user, signIn, bumpClusterList]);

  const openProfile = () => {
    onOpenProfile?.();
    openProfileView();
  };

  if (user) {
    return (
      <button
        type="button"
        onClick={openProfile}
        className="max-w-[11rem] truncate px-3 py-1.5 rounded-full border border-brand/15 bg-white text-xs font-semibold text-brand shadow-card hover:bg-brand-light/80"
        title={user.email || user.name}
      >
        {user.name}
      </button>
    );
  }

  if (apiMode()) {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      return (
        <span className="text-xs text-amber-800" title="VITE_GOOGLE_CLIENT_ID">
          Google Client ID 필요
        </span>
      );
    }
    return (
      <div
        ref={gsiHostRef}
        className="inline-flex items-center"
        data-testid="google-signin"
      />
    );
  }

  const onClick = () => {
    signIn({
      id: "demo_user",
      picture: "",
      name: "데모 사용자",
      email: "demo@example.com",
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full border border-gray-200 bg-white text-xs font-semibold text-tmap-ink shadow-card hover:bg-gray-50"
    >
      데모 로그인
    </button>
  );
}
