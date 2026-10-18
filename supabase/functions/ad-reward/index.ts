// Edge Function `ad-reward`: ver la lógica en _shared/handlers.ts (handleAdReward).
import { handleAdReward } from '../_shared/handlers.ts';
import { serveAuthed } from '../_shared/http.ts';

serveAuthed(handleAdReward);
