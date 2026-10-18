// Edge Function `start-run`: ver la lógica en _shared/handlers.ts (handleStartRun).
import { handleStartRun } from '../_shared/handlers.ts';
import { serveAuthed } from '../_shared/http.ts';

serveAuthed(handleStartRun);
