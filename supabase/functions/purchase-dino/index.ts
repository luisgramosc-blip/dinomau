// Edge Function `purchase-dino`: ver la lógica en _shared/handlers.ts (handlePurchase).
import { handlePurchase } from '../_shared/handlers.ts';
import { serveAuthed } from '../_shared/http.ts';

serveAuthed(handlePurchase);
