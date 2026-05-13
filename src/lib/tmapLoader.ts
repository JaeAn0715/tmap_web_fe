import type { Tmapv2Namespace } from "@/types/tmap";

/**
 * Resolves with `window.Tmapv2` once the SDK script (loaded synchronously
 * via `index.html`) finishes initializing.
 *
 * Why we don't dynamically inject the script tag:
 *   The TMAP V2 SDK uses `document.write()` to inject its sub-scripts.
 *   Browsers refuse to honor `document.write` from async-loaded scripts, so
 *   dynamic injection breaks the SDK ("Failed to execute 'write' on
 *   'Document'..."). The fix is to include the script in `index.html` so it
 *   runs during initial HTML parsing.
 *
 * Vite substitutes `%VITE_TMAP_APP_KEY%` in `index.html` from `.env`.
 */

const READY_TIMEOUT_MS = 10_000;

export function loadTmapSdk(appKey: string | undefined): Promise<Tmapv2Namespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("loadTmapSdk: window is undefined (SSR?)"));
  }

  if (window.Tmapv2) return Promise.resolve(window.Tmapv2);

  if (!appKey || appKey === "your_tmap_app_key_here") {
    return Promise.reject(
      new Error(
        "VITE_TMAP_APP_KEY is missing or unset. Copy .env.example to .env and set your TMAP appKey."
      )
    );
  }

  return new Promise<Tmapv2Namespace>((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (window.Tmapv2) return resolve(window.Tmapv2);
      if (Date.now() - start > READY_TIMEOUT_MS) {
        return reject(
          new Error(
            "TMAP SDK didn't initialize. Check the script tag in index.html and your VITE_TMAP_APP_KEY."
          )
        );
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}
