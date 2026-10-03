// Opt-in composite tool. Owns session/preview lifecycle and settings; callers
// provide already-snapped positions, style previews, and commit returned
// semantic data/geometry through their scene/history services.
import type { NGCompositePath } from '../model/NGPath';
import type { Vec2 } from '../model/geometryResolution';
import { PathDrawingSession, type CompositePointKind } from './PathDrawingSession';
import { PathRenderer, type FrameScheduler } from './PathRenderer';

export interface CompositeDeposit { source: NGCompositePath; item: paper.Path }
export class PathTool {
  private session: PathDrawingSession | null = null;
  private renderer: PathRenderer | null = null;
  private readonly scope: paper.PaperScope;
  private readonly updated: (item: paper.Path) => void;
  private readonly scheduler?: FrameScheduler;
  private radius = 12;
  constructor(scope: paper.PaperScope, updated: (item: paper.Path) => void, scheduler?: FrameScheduler) {
    this.scope = scope; this.updated = updated; this.scheduler = scheduler;
  }
  get active(): boolean { return this.session !== null; }
  get preview(): paper.Path | null { return this.renderer?.preview ?? null; }
  get snapBase(): Vec2 | null { return this.session?.snapBase ?? null; }
  get origin(): Vec2 | null { return this.session?.origin ?? null; }
  get cornerRadius(): number { return this.radius; }
  setCornerRadius(radius: number): void {
    if (!Number.isFinite(radius) || radius < 0) return;
    this.radius = radius; this.session?.setCornerRadius(radius); this.request();
  }
  point(kind: CompositePointKind, point: Vec2): void {
    if (!this.session) {
      this.session = new PathDrawingSession(crypto.randomUUID(), point, kind, this.radius);
      this.renderer = new PathRenderer(this.scope, this.updated, this.scheduler);
    } else this.session.commit(kind, point);
    this.request();
  }
  move(point: Vec2): void { this.session?.move(point); this.request(); }
  scale(factor: number): void { this.session?.scale(factor); this.request(); }
  rotate(degrees: number): void { this.session?.rotate(degrees); this.request(); }
  stamp(closed: boolean): CompositeDeposit | null {
    if (!this.session || !this.renderer) return null;
    const source = this.session.snapshot(closed);
    if (source.points.length < (closed ? 3 : 2)) return null;
    return { source, item: this.renderer.final(source) };
  }
  finish(closed: boolean): CompositeDeposit | null {
    const deposit = this.stamp(closed);
    this.cancel();
    return deposit;
  }
  flush(): void { this.renderer?.flush(); }
  cancel(): void { this.renderer?.dispose(); this.renderer = null; this.session = null; }
  private request(): void {
    if (this.session && this.renderer) this.renderer.request(() => this.session!.snapshot());
  }
}
