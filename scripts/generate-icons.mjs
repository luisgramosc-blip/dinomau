// Regenera los iconos PNG de public/icons a partir de design/icon-source.svg.
// Uso: npm i -D playwright && npx playwright install chromium && node scripts/generate-icons.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync } from 'node:fs';
const svg = readFileSync('design/icon-source.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
// size, archivo, relleno (las "maskable" necesitan margen seguro: el sistema recorta en círculo/gota)
const outputs = [[192, 'icon-192.png', 0], [512, 'icon-512.png', 0], [512, 'icon-maskable-512.png', 0], [180, 'apple-touch-icon.png', 0], [64, 'favicon-64.png', 0]];
for (const [size, name, pad] of outputs) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(`<html><body style="margin:0;background:#2e6a1e;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
  await page.screenshot({ path: 'public/icons/' + name, omitBackground: false });
}
await browser.close();
