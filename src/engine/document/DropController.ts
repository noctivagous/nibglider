// SVG and raster drops.
// Owns no selection or history. Reads the drop event, the view, and zoom.
// Mutates the scene only through host place, select, and recordDrop callbacks.
// One history entry per file that lands. A failed read records no command.
// Public: handle, looksLikeSvg, looksLikeRaster, viewFitScale.
// Tested from tests/drop-controller.test.mjs.

type Item = any;

export interface DropHost {
  scope(): paper.PaperScope;
  zoom(): number;
  clearSelection(): void;
  selectedItems(): Item[];
  addToSelection(item: Item): void;
  setDropNote(note: string): void;
  recordDrop(label: string, item: Item, selectedBefore: Item[]): void;
  updateTextContent(): void;
  notify(): void;
}

export function looksLikeSvg(file: { type?: string; name?: string }): boolean {
  if (/svg/i.test(file.type ?? '')) return true;
  return /\.svg$/i.test(file.name ?? '');
}

export function looksLikeRaster(file: { type?: string; name?: string }): boolean {
  if (/^image\//.test(file.type ?? '')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|avif|ico)$/i.test(file.name ?? '');
}

// Scale down only, so a large drop fits in 75% of the view. Smaller items stay 1.
export function viewFitScale(
  item: { width: number; height: number },
  view: { width: number; height: number },
): number {
  if (!(item.width > 0 && item.height > 0)) return 1;
  if (!(view.width > 0 && view.height > 0)) return 1;
  return Math.min(1, (view.width * 0.75) / item.width, (view.height * 0.75) / item.height);
}

export class DropController {
  private readonly host: DropHost;
  constructor(host: DropHost) { this.host = host; }

  handle(event: DragEvent): void {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const scope = this.host.scope();
    const view = scope.view;
    const canvas = view.element as HTMLCanvasElement | null;
    const rect = canvas ? canvas.getBoundingClientRect() : null;
    const base = rect != null
      ? view.viewToProject(new scope.Point(event.clientX - rect.left, event.clientY - rect.top))
      : view.center.clone();
    const cascade = 24 / this.host.zoom();
    this.host.setDropNote('');
    const selBefore = [...this.host.selectedItems()];
    this.host.clearSelection();
    this.host.updateTextContent();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const at = base.add(new scope.Point(cascade * i, cascade * i));
      if (looksLikeSvg(file)) this.dropSvgFile(file, at, selBefore);
      else if (looksLikeRaster(file)) this.dropRasterFile(file, at, selBefore);
      else this.dropUnknownFile(file, at, selBefore);
    }
    this.host.notify();
  }

  private note(note: string): void {
    this.host.setDropNote(note);
    this.host.updateTextContent();
    this.host.notify();
  }

  private fitItemToView(item: Item): void {
    try {
      const bounds = item.bounds;
      const vb = this.host.scope().view.bounds;
      if (!bounds || !vb) return;
      const scale = viewFitScale(bounds, vb);
      if (scale < 1) item.scale(scale, bounds.center);
    } catch { /* A drop must never throw. */ }
  }

  private place(label: string, item: Item, at: Item, selBefore: Item[]): void {
    if (!item) {
      this.note('Drop failed: could not read that file.');
      return;
    }
    try { item.position = at; } catch { /* Keep the imported position. */ }
    this.fitItemToView(item);
    this.host.addToSelection(item);
    this.host.recordDrop(label, item, selBefore);
    this.host.updateTextContent();
    this.host.notify();
  }

  private importSvgText(text: string, fileName: string, at: Item, selBefore: Item[]): void {
    try {
      this.host.scope().project.importSVG(text, (imported: Item) => {
        if (!imported) {
          this.note(`Drop failed: ${fileName} did not import.`);
          return;
        }
        try { imported.data.isUserGroup = true; } catch { /* Grouping just won't apply. */ }
        this.place(`Deposit ${fileName}`, imported, at, selBefore);
      });
    } catch {
      this.note(`Drop failed: ${fileName} did not import.`);
    }
  }

  private dropSvgFile(file: File, at: Item, selBefore: Item[]): void {
    const reader = new FileReader();
    reader.onerror = () => this.note(`Drop failed: could not read ${file.name}.`);
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result !== 'string' || !/<svg[\s>]/i.test(result.slice(0, 4096))) {
        this.note(`Drop failed: ${file.name} is not SVG.`);
        return;
      }
      this.importSvgText(result, file.name, at, selBefore);
    };
    reader.readAsText(file);
  }

  private dropRasterFile(file: File, at: Item, selBefore: Item[]): void {
    const reader = new FileReader();
    reader.onerror = () => this.note(`Drop failed: could not read ${file.name}.`);
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result !== 'string') {
        this.note(`Drop failed: could not read ${file.name}.`);
        return;
      }
      const image = new Image();
      image.onerror = () => this.note(`Drop failed: ${file.name} did not decode.`);
      image.onload = () => {
        let raster: Item = null;
        try {
          const scope = this.host.scope() as { Raster: new (source: HTMLImageElement) => Item };
          raster = new scope.Raster(image);
        } catch { raster = null; }
        this.place(`Deposit ${file.name}`, raster, at, selBefore);
      };
      image.src = result;
    };
    reader.readAsDataURL(file);
  }

  private dropUnknownFile(file: File, at: Item, selBefore: Item[]): void {
    const reader = new FileReader();
    reader.onerror = () => this.note(`Drop skipped: ${file.name} is not an image.`);
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string' && /<svg[\s>]/i.test(result.slice(0, 4096))) {
        this.importSvgText(result, file.name, at, selBefore);
        return;
      }
      this.note(`Drop skipped: ${file.name} is not an image.`);
    };
    reader.readAsText(file);
  }
}
