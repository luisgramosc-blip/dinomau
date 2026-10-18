/**
 * Compartir el resultado.
 *
 * 1. Web Share API con la imagen: en el móvil abre el menú nativo, donde el
 *    jugador elige WhatsApp (Estados), Instagram (Stories), Facebook, etc.
 * 2. Si el navegador no puede compartir archivos: descarga la imagen y copia
 *    el texto con el link al portapapeles.
 * 3. Botones directos (solo texto + link): WhatsApp, Facebook y X.
 */
export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded';

export interface ShareEnv {
  navigator: Pick<Navigator, 'share' | 'canShare'> & { clipboard?: Pick<Clipboard, 'writeText'> };
  /** Descarga un archivo (inyectable para tests). */
  download(blob: Blob, filename: string): void;
  open(url: string): void;
}

export const browserShareEnv = (): ShareEnv => ({
  navigator,
  download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
  open(url) {
    window.open(url, '_blank', 'noopener');
  },
});

export const STORY_FILENAME = 'dinomau-record.png';

/** ¿Se puede compartir la imagen como archivo en este navegador? */
export function canShareImage(env: ShareEnv, blob: Blob): boolean {
  if (typeof env.navigator.share !== 'function' || typeof env.navigator.canShare !== 'function') return false;
  try {
    const file = new File([blob], STORY_FILENAME, { type: 'image/png' });
    return env.navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Comparte la imagen con el menú nativo o, si no se puede, descarga + copia el texto. */
export async function shareStory(env: ShareEnv, blob: Blob, text: string, url: string): Promise<ShareOutcome> {
  if (canShareImage(env, blob)) {
    const file = new File([blob], STORY_FILENAME, { type: 'image/png' });
    try {
      // El link va dentro del texto: varias apps ignoran `url` si hay archivos
      await env.navigator.share!({ files: [file], text: `${text} ${url}`.trim(), title: 'dinoMau' });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
      // Otro error (p. ej. permisos): seguimos con el plan B
    }
  }
  env.download(blob, STORY_FILENAME);
  await copyText(env, `${text} ${url}`.trim());
  return 'downloaded';
}

export async function copyText(env: ShareEnv, text: string): Promise<boolean> {
  try {
    await env.navigator.clipboard?.writeText(text);
    return !!env.navigator.clipboard;
  } catch {
    return false;
  }
}

/** Links directos de cada red (no admiten adjuntar la imagen; llevan texto y link). */
export function socialLinks(text: string, url: string): { whatsapp: string; facebook: string; x: string } {
  const e = encodeURIComponent;
  return {
    whatsapp: `https://wa.me/?text=${e(`${text} ${url}`)}`,
    // Facebook solo acepta la URL; el texto lo escribe el usuario
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`,
    x: `https://x.com/intent/post?text=${e(text)}&url=${e(url)}`,
  };
}
