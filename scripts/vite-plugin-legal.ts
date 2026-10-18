import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/** Fecha que se muestra en la política de privacidad: cámbiala al editarla. */
const PRIVACY_UPDATED = '18 de octubre de 2026';

/**
 * Páginas que exige Google AdSense, generadas con las variables de entorno:
 *  - /privacy.html  política de privacidad (legal/privacy.html + VITE_CONTACT_EMAIL)
 *  - /ads.txt       autoriza a Google a vender anuncios en el dominio (con VITE_ADSENSE_CLIENT)
 */
export function legalPages(env: Record<string, string>): Plugin {
  const email = env.VITE_CONTACT_EMAIL?.trim();
  const client = env.VITE_ADSENSE_CLIENT?.trim();

  const privacy = () =>
    readFileSync('legal/privacy.html', 'utf8')
      .replaceAll('%CONTACT_EMAIL%', escapeHtml(email || 'el correo de contacto del juego'))
      .replaceAll('%UPDATED%', PRIVACY_UPDATED);
  // ca-pub-123 → pub-123 (formato de ads.txt). f08c47fec0942fa0 es el id fijo de Google.
  const adsTxt = client ? `google.com, ${client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n` : null;

  return {
    name: 'dinomau-legal-pages',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/privacy.html') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.end(privacy());
        }
        if (req.url === '/ads.txt' && adsTxt) {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          return res.end(adsTxt);
        }
        next();
      });
    },
    buildStart() {
      if (!email) this.warn('Falta VITE_CONTACT_EMAIL: la política de privacidad no tendrá correo de contacto.');
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'privacy.html', source: privacy() });
      if (adsTxt) this.emitFile({ type: 'asset', fileName: 'ads.txt', source: adsTxt });
    },
  };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
