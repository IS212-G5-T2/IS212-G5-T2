/** Shared draft ownership until authentication is integrated. No login is required. */
export interface DraftWorkspace { userId: string; organisationId: string }
export const anonymousDraftWorkspace: Readonly<DraftWorkspace> = Object.freeze({
  userId: 'anonymous', organisationId: 'anonymous-drafts',
});
