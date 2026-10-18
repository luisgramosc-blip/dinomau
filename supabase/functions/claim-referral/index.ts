// Edge Function `claim-referral`: ver la lógica en _shared/handlers.ts (handleClaimReferral).
import { handleClaimReferral } from '../_shared/handlers.ts';
import { serveAuthed } from '../_shared/http.ts';

serveAuthed(handleClaimReferral);
