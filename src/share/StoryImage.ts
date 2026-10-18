/**
 * Imagen vertical 1080×1920 (formato historia de WhatsApp / Instagram) con el
 * resultado de la partida. Todo se dibuja con Canvas 2D a partir de formas
 * simples, sin imágenes externas, así funciona sin conexión.
 *
 * No usa emojis dentro del canvas: no todos los dispositivos tienen fuente de
 * emojis y saldrían cuadrados.
 */
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

export interface StoryData {
  score: number;
  distance: number;
  coins: number;
  dinoName: string;
  isRecord: boolean;
  /** Link que se muestra (referido si hay cuenta, si no la web del juego). */
  link: string;
  /** Retrato del dino (canvas transparente), opcional. */
  portrait?: CanvasImageSource;
  texts: {
    newRecord: string;
    score: string;
    coins: string;
    meters: string;
    challenge: string;
    linkCta: string;
  };
  formatNumber: (n: number) => string;
}

const DISPLAY = '"Lilita One", "Trebuchet MS", system-ui, sans-serif';
const BODY = 'Nunito, system-ui, sans-serif';
const INK = '#2b1a0e';

/** Espera a que las fuentes del juego estén listas (si no, el canvas usa la de sistema). */
export async function ensureStoryFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load(`120px ${DISPLAY}`),
      document.fonts.load(`800 40px ${BODY}`),
    ]);
  } catch {
    /* sin fuentes web: se usan las de sistema */
  }
}

export function drawStory(ctx: CanvasRenderingContext2D, d: StoryData): void {
  const W = STORY_WIDTH;
  const H = STORY_HEIGHT;
  ctx.save();
  ctx.clearRect(0, 0, W, H);

  // --- Fondo: cielo de atardecer, montañas, volcán y selva ----------------------
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, '#5fb8d8');
  sky.addColorStop(0.55, '#f6d6a0');
  sky.addColorStop(1, '#f2a65e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Sol
  const sun = ctx.createRadialGradient(W * 0.72, 760, 10, W * 0.72, 760, 260);
  sun.addColorStop(0, 'rgba(255,240,190,0.95)');
  sun.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 400, W, 700);

  polygon(ctx, '#d9a77a', [[-100, 1180], [180, 820], [420, 1180]]);
  polygon(ctx, '#c9926a', [[700, 1180], [980, 780], [1260, 1180]]);

  // Volcán con lava y humo
  polygon(ctx, '#8a5440', [[220, 1190], [470, 700], [610, 700], [860, 1190]]);
  polygon(ctx, '#ff6a1a', [[470, 700], [610, 700], [590, 735], [490, 735]]);
  polygon(ctx, '#ffb13b', [[510, 735], [540, 735], [500, 900], [480, 890]]);
  // Humo inclinado hacia la derecha para no tapar el logo ni el letrero
  ctx.fillStyle = 'rgba(120,105,98,0.5)';
  for (let i = 0; i < 4; i++) circle(ctx, 570 + i * 70, 650 - i * 50, 45 + i * 14);

  // Suelo: hierba y camino de tierra en perspectiva
  ctx.fillStyle = '#5da93a';
  ctx.fillRect(0, 1160, W, H - 1160);
  polygon(ctx, '#b8864b', [[430, 1160], [650, 1160], [1000, H], [80, H]]);
  ctx.fillStyle = '#9a6d3a';
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    const y = 1180 + t * t * 760;
    const w = 8 + t * 22;
    ctx.fillRect(W / 2 - w / 2, y, w, 18 + t * 60);
  }

  // Palmeras en silueta a los lados
  palm(ctx, 90, 1380, 1);
  palm(ctx, 990, 1330, -1);

  // --- Logo -----------------------------------------------------------------
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.font = `190px ${DISPLAY}`;
  const dinoW = ctx.measureText('dino').width;
  const mauW = ctx.measureText('Mau').width;
  const startX = W / 2 - (dinoW + mauW) / 2;
  ctx.textAlign = 'left';
  strokedText(ctx, 'dino', startX, 290, '#7cc242', 14, 12);
  strokedText(ctx, 'Mau', startX + dinoW, 290, '#ffb13b', 14, 12);
  ctx.textAlign = 'center';

  // --- Récord ----------------------------------------------------------------
  if (d.isRecord) {
    ctx.save();
    ctx.translate(W / 2, 400);
    ctx.rotate(-0.04);
    roundRect(ctx, -330, -62, 660, 112, 56, '#ff6a1a', INK, 8);
    ctx.font = `70px ${DISPLAY}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(d.texts.newRecord, 0, 22);
    ctx.restore();
  }

  // --- Dino -----------------------------------------------------------------
  // Los pies del retrato quedan a ~75 % de su altura: se apoyan sobre la sombra
  const size = 860;
  const top = 1150 - size * 0.76;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ellipse(ctx, W / 2, 1150, 280, 46);
  if (d.portrait) ctx.drawImage(d.portrait, W / 2 - size / 2, top, size, size);

  // --- Tarjeta de resultado ----------------------------------------------------
  roundRect(ctx, 90, 1200, W - 180, 420, 48, 'rgba(43,26,14,0.88)', INK, 8);
  ctx.fillStyle = '#f6e3c0';
  ctx.font = `800 44px ${BODY}`;
  ctx.fillText(`${d.texts.score.toUpperCase()} · ${d.dinoName}`, W / 2, 1285);
  ctx.font = `200px ${DISPLAY}`;
  strokedText(ctx, d.formatNumber(d.score), W / 2, 1475, '#ffffff', 12, 10);

  // Monedas y distancia
  ctx.font = `64px ${DISPLAY}`;
  const coinsText = `${d.formatNumber(d.coins)} ${d.texts.coins}`;
  const distText = `${d.formatNumber(d.distance)} ${d.texts.meters}`;
  const gap = 70;
  const cw = ctx.measureText(coinsText).width + 70;
  const dw = ctx.measureText(distText).width;
  let x = W / 2 - (cw + gap + dw) / 2;
  coinIcon(ctx, x + 26, 1555, 26);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffcc2e';
  ctx.fillText(coinsText, x + 66, 1578);
  x += cw + gap;
  ctx.fillStyle = '#f6e3c0';
  ctx.fillText(distText, x, 1578);
  ctx.textAlign = 'center';

  // --- Reto y link ---------------------------------------------------------------
  ctx.font = `92px ${DISPLAY}`;
  strokedText(ctx, d.texts.challenge, W / 2, 1745, '#ffffff', 12, 8);
  roundRect(ctx, 110, 1780, W - 220, 110, 55, '#7cc242', INK, 7);
  ctx.fillStyle = INK;
  ctx.font = `800 30px ${BODY}`;
  ctx.fillText(d.texts.linkCta, W / 2, 1822);
  ctx.font = `800 40px ${BODY}`;
  fitText(ctx, d.link.replace(/^https?:\/\//, ''), W / 2, 1868, W - 300);

  ctx.restore();
}

/** Genera la imagen como PNG. */
export async function renderStoryBlob(d: StoryData): Promise<Blob> {
  await ensureStoryFonts();
  const canvas = document.createElement('canvas');
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  drawStory(canvas.getContext('2d')!, d);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob falló'))), 'image/png'),
  );
}

// --- Primitivas de dibujo ------------------------------------------------------

function polygon(ctx: CanvasRenderingContext2D, color: string, pts: Array<[number, number]>): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
  fill: string, stroke?: string, lineWidth = 0,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke && lineWidth) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

/** Texto con borde oscuro y sombra sólida, estilo cartoon. */
function strokedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, stroke: number, shadow: number): void {
  ctx.fillStyle = INK;
  ctx.fillText(text, x, y + shadow);
  ctx.lineWidth = stroke;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Reduce la fuente hasta que el texto quepa en `maxWidth`. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number): void {
  const match = ctx.font.match(/(\d+)px/);
  let size = match ? Number(match[1]) : 40;
  while (size > 18 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = ctx.font.replace(/\d+px/, `${size}px`);
  }
  ctx.fillText(text, x, y);
}

function coinIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const g = ctx.createRadialGradient(x - r / 3, y - r / 3, 2, x, y, r);
  g.addColorStop(0, '#fff3b0');
  g.addColorStop(0.45, '#ffcc2e');
  g.addColorStop(1, '#e0a100');
  ctx.fillStyle = g;
  circle(ctx, x, y, r);
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function palm(ctx: CanvasRenderingContext2D, x: number, y: number, dir: 1 | -1): void {
  ctx.strokeStyle = '#3d2a1a';
  ctx.lineWidth = 34;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y + 560);
  ctx.quadraticCurveTo(x + 40 * dir, y + 250, x - 10 * dir, y);
  ctx.stroke();
  ctx.fillStyle = '#2e7a2a';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    ctx.save();
    ctx.translate(x - 10 * dir, y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(110, 0, 120, 28, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
