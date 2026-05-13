/** Share URL for a cluster (hash route). No backend call — id is the slug. */
export function clusterShareUrl(clusterId: string): string {
  return `${window.location.origin}${window.location.pathname}#/c/${clusterId}`;
}

export async function copyClusterShareLink(clusterId: string): Promise<boolean> {
  const text = clusterShareUrl(clusterId);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
