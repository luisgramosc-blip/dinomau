import { describe, expect, it, vi } from 'vitest';
import { shareStory, socialLinks, type ShareEnv } from '@/share/ShareService';

const blob = new Blob(['png'], { type: 'image/png' });

function env(over: Partial<ShareEnv['navigator']> = {}) {
  const download = vi.fn();
  const writeText = vi.fn(async () => {});
  const e: ShareEnv = {
    navigator: { share: undefined as never, canShare: undefined as never, clipboard: { writeText }, ...over },
    download,
    open: vi.fn(),
  };
  return { e, download, writeText };
}

describe('shareStory', () => {
  it('usa el menú nativo con la imagen cuando el navegador lo permite', async () => {
    const share = vi.fn(async () => {});
    const { e, download } = env({ share, canShare: () => true });
    expect(await shareStory(e, blob, '¡Hice 100!', 'https://x.app/r/ABC')).toBe('shared');
    const arg = (share.mock.calls[0] as unknown as [ShareData])[0];
    expect(arg.files?.[0].name).toBe('dinomau-record.png');
    expect(arg.text).toContain('https://x.app/r/ABC');
    expect(download).not.toHaveBeenCalled();
  });

  it('si el jugador cancela no descarga nada', async () => {
    const abort = Object.assign(new Error('cancel'), { name: 'AbortError' });
    const { e, download } = env({ share: vi.fn(async () => { throw abort; }), canShare: () => true });
    expect(await shareStory(e, blob, 't', 'u')).toBe('cancelled');
    expect(download).not.toHaveBeenCalled();
  });

  it('sin Web Share de archivos: descarga la imagen y copia el texto con el link', async () => {
    const { e, download, writeText } = env({ share: vi.fn(), canShare: () => false });
    expect(await shareStory(e, blob, '¡Hice 100!', 'https://x.app')).toBe('downloaded');
    expect(download).toHaveBeenCalledWith(blob, 'dinomau-record.png');
    expect(writeText).toHaveBeenCalledWith('¡Hice 100! https://x.app');
  });

  it('si el menú nativo falla por otro motivo, usa el plan B', async () => {
    const { e, download } = env({ share: vi.fn(async () => { throw new Error('NotAllowed'); }), canShare: () => true });
    expect(await shareStory(e, blob, 't', 'u')).toBe('downloaded');
    expect(download).toHaveBeenCalled();
  });
});

describe('socialLinks', () => {
  it('codifica texto y link para cada red', () => {
    const l = socialLinks('¡Hice 1.000 puntos! 🦖', 'https://dino.app/r/ABC123');
    expect(l.whatsapp).toBe(`https://wa.me/?text=${encodeURIComponent('¡Hice 1.000 puntos! 🦖 https://dino.app/r/ABC123')}`);
    expect(l.facebook).toBe('https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fdino.app%2Fr%2FABC123');
    expect(l.x).toContain('x.com/intent/post?text=');
    expect(l.x).toContain('url=https%3A%2F%2Fdino.app%2Fr%2FABC123');
  });
});
