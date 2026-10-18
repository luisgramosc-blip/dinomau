/** Utilidades DOM mínimas para las pantallas (sin framework). */

/** Crea un elemento a partir de HTML (un solo nodo raíz). */
export function html<T extends HTMLElement = HTMLElement>(markup: string): T {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild as T;
}

/** querySelector que falla en voz alta si falta el elemento. */
export function $<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`UI: falta ${selector}`);
  return el;
}

export function show(...els: HTMLElement[]): void {
  els.forEach((el) => el.classList.remove('hidden'));
}

export function hide(...els: HTMLElement[]): void {
  els.forEach((el) => el.classList.add('hidden'));
}

/** Reinicia una animación CSS de una clase (p. ej. "bump"). */
export function replayAnimation(el: HTMLElement, className: string): void {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

/** Evita que tocar un botón inicie un swipe en el canvas. */
export function stopSwipe(root: HTMLElement): void {
  root.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button, .card, input')) e.stopPropagation();
  });
}

/** Escapa texto para insertarlo en HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
