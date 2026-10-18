// Edge Function `finish-run`: ver la lógica en _shared/handlers.ts (handleFinishRun).
import { handleFinishRun } from '../_shared/handlers.ts';
import { serveAuthed } from '../_shared/http.ts';

serveAuthed(handleFinishRun);
