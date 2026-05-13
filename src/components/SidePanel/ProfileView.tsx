import { Button } from "@/components/UI/Button";
import { useStore } from "@/store/useStore";

/** Neutral avatar when Google `picture` is missing (data URL, no network). */
const PROFILE_PHOTO_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80">
  <rect width="80" height="80" rx="40" fill="#E8ECF0"/>
  <circle cx="40" cy="30" r="12" fill="#9AA3AF"/>
  <ellipse cx="40" cy="58" rx="22" ry="16" fill="#9AA3AF"/>
</svg>`
  );

/**
 * Pushed from the map toolbar name chip. Logout lives here (not on the chip).
 */
export function ProfileView() {
  const user = useStore((s) => s.user);
  const signOut = useStore((s) => s.signOut);
  const goBack = useStore((s) => s.goBackInPanel);

  if (!user) return null;

  const onLogout = () => {
    signOut();
    goBack();
  };

  const photoSrc = user.picture?.trim() || PROFILE_PHOTO_PLACEHOLDER;

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
      <div className="flex flex-col items-center gap-2 pt-2">
        <img
          src={photoSrc}
          alt=""
          className="w-16 h-16 rounded-full border border-gray-200/90 object-cover bg-gray-100"
          onError={(e) => {
            (e.target as HTMLImageElement).src = PROFILE_PHOTO_PLACEHOLDER;
          }}
        />
        <div className="text-center">
          <div className="text-base font-semibold text-gray-900">{user.name}</div>
          {user.email && (
            <div className="text-xs text-gray-500 mt-0.5 break-all">{user.email}</div>
          )}
        </div>
      </div>

      <div className="border-t pt-4">
        <Button variant="secondary" className="w-full" onClick={onLogout}>
          로그아웃
        </Button>
      </div>
    </div>
  );
}
