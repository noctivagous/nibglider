// One-way adapter for the new model boundary. Owns only derived item lookup;
// durable records remain with the caller. Explicit layer/style callbacks
// prevent independent document or engine state. Existing tools are untouched.
// Tests cover rebuilds, handles, transforms, holes, and source immutability.
import type { NGDrawable } from '../model/NGDrawable';
import type { ResolvedPath, ResolvedVectorGeometry } from '../model/geometryResolution';
import { resolveDrawableGeometry } from '../geometry/pathResolver';
import { installStrokePositionRenderer } from '../appearance/strokePosition';
import type { SceneRepository } from './SceneRepository';

export interface DrawableStyle {
  strokeColor: string | null;
  fillColor: string | null;
  strokeWidth: number;
}
export interface DrawableRendererDependencies {
  layerForId: (id: string) => paper.Layer | null;
  styleForId?: (id: string) => DrawableStyle | undefined;
  scene?: SceneRepository;
}

export class DrawableRenderer {
  private readonly scope: paper.PaperScope;
  private readonly dependencies: DrawableRendererDependencies;
  private readonly items = new Map<string, paper.PathItem>();

  constructor(scope: paper.PaperScope, dependencies: DrawableRendererDependencies) {
    this.scope = scope;
    installStrokePositionRenderer(scope);
    this.dependencies = dependencies;
  }

  render(drawable: NGDrawable): paper.PathItem {
    const geometry = resolveDrawableGeometry(drawable);
    const layer = this.dependencies.layerForId(drawable.layerId);
    if (!layer || layer.project !== this.scope.project) throw new Error(`No layer in this project for ${drawable.layerId}`);
    const style = drawable.styleId ? this.dependencies.styleForId?.(drawable.styleId) : { strokeColor: '#000000', fillColor: null, strokeWidth: 1 };
    if (!style) throw new Error(`No style for ${drawable.styleId}`);
    if (!Number.isFinite(style.strokeWidth) || style.strokeWidth < 0) throw new Error('Invalid stroke width');
    this.scope.activate();
    // Resolve and construct completely before replacing the previous item.
    const item = this.build(geometry);
    try {
      item.strokeColor = style.strokeColor === null ? null : new this.scope.Color(style.strokeColor);
      item.fillColor = style.fillColor === null ? null : new this.scope.Color(style.fillColor);
      item.strokeWidth = style.strokeWidth;
      item.visible = drawable.visible;
      item.locked = drawable.locked;
      item.opacity = drawable.opacity;
      if (drawable.name !== undefined) item.name = drawable.name;
      const t = drawable.transform;
      item.transform(new this.scope.Matrix(t.a, t.b, t.c, t.d, t.tx, t.ty));
      const tag = (child: paper.Item): void => {
        child.data.drawableId = drawable.id;
        child.children?.forEach(tag);
      };
      tag(item);
      layer.addChild(item);
      this.items.get(drawable.id)?.remove();
      this.items.set(drawable.id, item);
      if (this.dependencies.scene) {
        if (this.dependencies.scene.isInScene(item)) this.dependencies.scene.bindDrawable(drawable, item);
        else this.dependencies.scene.unbindDrawable(drawable.id);
      }
      return item;
    } catch (error) {
      item.remove();
      throw error;
    }
  }

  getItem(id: string): paper.PathItem | undefined { return this.items.get(id); }

  drawableIdOf(item: paper.Item): string | null {
    for (let candidate: paper.Item | null = item; candidate; candidate = candidate.parent) {
      const id = candidate.data.drawableId;
      // Reject stale/foreign tags, including clones outside our mapping.
      if (typeof id === 'string' && this.items.get(id) === candidate) return id;
    }
    return null;
  }

  remove(id: string): void { this.items.get(id)?.remove(); this.items.delete(id); this.dependencies.scene?.unbindDrawable(id); }
  clear(): void { for (const id of this.items.keys()) this.remove(id); }

  private path(geometry: ResolvedPath): paper.Path {
    return new this.scope.Path({
      insert: false, closed: geometry.closed,
      segments: geometry.segments.map((s) => new this.scope.Segment(
        new this.scope.Point(s.point.x, s.point.y),
        new this.scope.Point(s.handleIn.x, s.handleIn.y),
        new this.scope.Point(s.handleOut.x, s.handleOut.y),
      )),
    });
  }
  private build(geometry: ResolvedVectorGeometry): paper.PathItem {
    if (geometry.kind === 'path') return this.path(geometry);
    return new this.scope.CompoundPath({
      insert: false, fillRule: geometry.fillRule,
      children: geometry.paths.map((path) => this.path(path)),
    });
  }
}
