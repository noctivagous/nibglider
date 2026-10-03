// Derived path construction and frame-coalesced preview updates. Owns one
// ephemeral Paper path and frame handle; final source/history stay external.
import type { NGCompositePath } from '../model/NGPath';
import type { ResolvedPath } from '../model/geometryResolution';
import { resolveCompositePath } from '../geometry/compositeExpansion';

export interface FrameScheduler {
  request: (callback: () => void) => number;
  cancel: (handle: number) => void;
}
const browserFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};
export class PathRenderer {
  readonly preview: paper.Path;
  private frame: number | null = null;
  private pending: (() => NGCompositePath) | null = null;
  private readonly scope: paper.PaperScope;
  private readonly scheduler: FrameScheduler;
  private readonly updated: (item: paper.Path) => void;

  constructor(scope: paper.PaperScope, updated: (item: paper.Path) => void, scheduler = browserFrames) {
    this.scope = scope; this.scheduler = scheduler; this.updated = updated;
    scope.activate();
    this.preview = new scope.Path({ insert: false });
    this.preview.data.isPathPreview = true;
  }
  request(path: () => NGCompositePath): void {
    this.pending = path;
    if (this.frame !== null) return;
    this.frame = this.scheduler.request(() => { this.frame = null; this.flush(); });
  }
  flush(): void {
    if (this.frame !== null) { this.scheduler.cancel(this.frame); this.frame = null; }
    if (!this.pending) return;
    this.scope.activate();
    const path = this.pending(); this.pending = null;
    const geometry = resolveCompositePath(path, { tolerance: 0.5 / (this.scope.view.zoom || 1) });
    this.preview.removeSegments();
    this.preview.addSegments(this.segments(geometry));
    this.preview.closed = geometry.closed;
    this.updated(this.preview);
  }
  final(path: NGCompositePath): paper.Path {
    this.scope.activate();
    // Final document sampling is zoom-independent and tighter than previews.
    const geometry = resolveCompositePath(path, { tolerance: 0.1 });
    return new this.scope.Path({ insert: false, applyMatrix: false,
      closed: geometry.closed, segments: this.segments(geometry) });
  }
  dispose(): void {
    if (this.frame !== null) this.scheduler.cancel(this.frame);
    this.frame = null; this.pending = null; this.preview.remove();
  }
  private segments(geometry: ResolvedPath): paper.Segment[] {
    return geometry.segments.map((s) => new this.scope.Segment(new this.scope.Point(s.point.x, s.point.y)));
  }
}
