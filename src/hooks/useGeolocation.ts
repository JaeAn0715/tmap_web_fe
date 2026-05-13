import { useEffect, useState } from "react";

export type GeoPermission = "prompt" | "granted" | "denied" | "unsupported";

export interface GeoState {
  status: GeoPermission;
  position: { lat: number; lng: number } | null;
  error: string | null;
}

/**
 * Requests one-shot geolocation permission on mount.
 *
 * Why one-shot (not watchPosition): the spec says "지도는 항상 사용자의 위치를
 * 중심으로 한다" — but we interpret this as the *initial* center. Continuously
 * recentering would fight the user's drag/zoom interactions, which is hostile
 * UX. If a follow-me mode is needed later we can layer it on top of this hook.
 */
export function useGeolocation(): GeoState {
  const [state, setState] = useState<GeoState>({
    status: "prompt",
    position: null,
    error: null,
  });

  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState({ status: "unsupported", position: null, error: "Geolocation API 미지원" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          status: "granted",
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          error: null,
        });
      },
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED;
        setState({
          status: denied ? "denied" : "prompt",
          position: null,
          error: err.message,
        });
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 5 * 60 * 1000,
      }
    );
  }, []);

  return state;
}
