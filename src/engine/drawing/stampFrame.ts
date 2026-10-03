// Shared stamp of the visible frame and its preview inner. Circle radius 0
// and plain rectangle frames both use this; fitted inners stamp themselves.
import type { DrawingHost } from './DrawingHost';

export function stampVisibleFrame(host: DrawingHost): void {
  const session = host.session;
  const framePreview = session.previewShape || session.previewRect || session.previewPath;
  if (framePreview) {
    const stampedFrame = framePreview.clone();
    host.applyCurrentStyles(stampedFrame);
    host.clearShadow(stampedFrame);
    stampedFrame.opacity = 1;
    stampedFrame.selected = false;
    const placed = host.place(stampedFrame, { front: true });
    if (placed) placed.selected = false;
  }
  if (!session.previewInner) return;
  const stampedInner = session.previewInner.clone();
  host.clearShadow(stampedInner);
  host.resetStampedText(stampedInner);
  const target = host.shapePartOf(stampedInner);
  target.strokeColor = host.strokeEnabled() ? host.globalStrokeColor() : null;
  target.strokeWidth = host.strokeEnabled() ? host.globalStrokeWidth() * 0.7 : 0;
  if (host.fillEnabled()) host.applyFill(target);
  else target.fillColor = null;
  host.applyStrokeGeometry(target);
  host.applyStrokeDash(target);
  stampedInner.selected = false;
  const placed = host.place(stampedInner, { front: true });
  if (placed) placed.selected = false;
}
