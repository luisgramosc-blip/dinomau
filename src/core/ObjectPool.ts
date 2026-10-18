/**
 * Pool genérico de objetos. Evita crear/destruir mallas durante la partida,
 * que es lo que provoca tirones por recolección de basura en móviles.
 *
 * - `acquire()` devuelve un objeto libre (o crea uno si el pool se agota).
 * - `release()` lo devuelve en O(1) (swap-remove en la lista de activos).
 */
export class ObjectPool<T> {
  private readonly free: T[] = [];
  private readonly active: T[] = [];
  private readonly indexOf = new Map<T, number>();

  constructor(
    private readonly factory: () => T,
    private readonly onAcquire: (item: T) => void = () => {},
    private readonly onRelease: (item: T) => void = () => {},
    initialSize = 0,
  ) {
    for (let i = 0; i < initialSize; i++) {
      const item = this.factory();
      this.onRelease(item);
      this.free.push(item);
    }
  }

  acquire(): T {
    const item = this.free.pop() ?? this.factory();
    this.indexOf.set(item, this.active.length);
    this.active.push(item);
    this.onAcquire(item);
    return item;
  }

  release(item: T): void {
    const index = this.indexOf.get(item);
    if (index === undefined) return; // ya liberado
    const last = this.active.pop()!;
    if (last !== item) {
      this.active[index] = last;
      this.indexOf.set(last, index);
    }
    this.indexOf.delete(item);
    this.onRelease(item);
    this.free.push(item);
  }

  releaseAll(): void {
    while (this.active.length > 0) this.release(this.active[this.active.length - 1]);
  }

  /**
   * Recorre los activos. Es seguro liberar el elemento actual dentro del
   * callback (se itera de atrás hacia delante).
   */
  forEachActive(fn: (item: T) => void): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const item = this.active[i];
      if (item !== undefined) fn(item);
    }
  }

  get activeCount(): number {
    return this.active.length;
  }

  get totalCount(): number {
    return this.active.length + this.free.length;
  }
}
