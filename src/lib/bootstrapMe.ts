import { apiMode } from "./apiConfig";
import { getAuthToken } from "./http";
import { syncRecentDestinationsFromBackend } from "./recentDestinations";
import { syncSavedPlacesFromBackend } from "./savedPlaces";

/** Pull user-scoped data after login / session restore. */
export async function pullAllMeData(): Promise<void> {
  if (!apiMode() || !getAuthToken()) return;
  await Promise.all([
    syncSavedPlacesFromBackend(),
    syncRecentDestinationsFromBackend(),
  ]);
}
