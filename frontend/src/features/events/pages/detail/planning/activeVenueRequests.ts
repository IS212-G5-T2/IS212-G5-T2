type VenueRequest = { status: string };

/** SPM-54 AC9: cancelled requests stay in booking history, not the active event venue list. */
export function activeVenueRequests<T extends VenueRequest>(
  requests: readonly T[],
): T[] {
  return requests.filter((request) => request.status !== "cancelled");
}
