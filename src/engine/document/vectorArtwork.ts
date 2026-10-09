// Imported SVG and PDF become nested NibGlider groups.
// Every Paper group is marked data.isUserGroup so Ungroup walks one level
// at a time. Shapes become paths so booleans and anchors see geometry.
// PDF pages are read from pdf.js operator lists (user space, y flipped
// into Paper's top-left coordinates). Operator numbers match pdf.js 6.4.

type Item = any;

export const IMAGE_ONLY_IMPORT_NOTE =
  'That file has no vector paths. It was grouped so Ungroup can release the image.';

export const PDF_FN = {
  setLineWidth: 2,
  setLineCap: 3,
  setLineJoin: 4,
  setDash: 6,
  save: 10,
  restore: 11,
  transform: 12,
  rectangle: 19,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  eoFillStroke: 25,
  closeFillStroke: 26,
  closeEOFillStroke: 27,
  endPath: 28,
  beginText: 31,
  endText: 32,
  setLeading: 36,
  setFont: 37,
  moveText: 40,
  setLeadingMoveText: 41,
  setTextMatrix: 42,
  nextLine: 43,
  showText: 44,
  showSpacedText: 45,
  nextLineShowText: 46,
  nextLineSetSpacingShowText: 47,
  setStrokeGray: 56,
  setFillGray: 57,
  setStrokeRGBColor: 58,
  setFillRGBColor: 59,
  setStrokeCMYKColor: 60,
  setFillCMYKColor: 61,
  beginMarkedContent: 69,
  beginMarkedContentProps: 70,
  endMarkedContent: 71,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  beginGroup: 76,
  endGroup: 77,
  constructPath: 91,
  setStrokeTransparent: 92,
  setFillTransparent: 93,
} as const;

const DRAW_MOVE = 0;
const DRAW_LINE = 1;
const DRAW_CURVE = 2;
const DRAW_QUAD = 3;
const DRAW_CLOSE = 4;

export interface ArtworkPoint { x: number; y: number }
export type ArtworkCommand =
  | ({ op: 'M' | 'L' } & ArtworkPoint)
  | { op: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: 'Q'; x1: number; y1: number; x: number; y: number }
  | { op: 'Z' };

export interface PdfArtworkPath {
  kind: 'path';
  commands: ArtworkCommand[];
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'miter' | 'round' | 'bevel';
  dash: number[] | null;
  evenOdd: boolean;
}

export interface PdfArtworkText {
  kind: 'text';
  x: number;
  y: number;
  size: number;
  rotation: number;
  content: string;
  fill: string | null;
}

export interface PdfArtworkGroup {
  kind: 'group';
  children: PdfArtworkNode[];
}

export type PdfArtworkNode = PdfArtworkGroup | PdfArtworkPath | PdfArtworkText;

type Matrix6 = [number, number, number, number, number, number];

interface Graphics {
  ctm: Matrix6;
  fill: string | null;
  stroke: string | null;
  lineWidth: number;
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'miter' | 'round' | 'bevel';
  dash: number[] | null;
  fontSize: number;
  leading: number;
  textMatrix: Matrix6;
  lineMatrix: Matrix6;
}

const IDENTITY: Matrix6 = [1, 0, 0, 1, 0, 0];

function cloneGraphics(state: Graphics): Graphics {
  return {
    ...state,
    ctm: [...state.ctm],
    textMatrix: [...state.textMatrix],
    lineMatrix: [...state.lineMatrix],
    dash: state.dash ? [...state.dash] : null,
  };
}

function multiply(left: Matrix6, right: Matrix6): Matrix6 {
  const [a, b, c, d, e, f] = left;
  const [A, B, C, D, E, F] = right;
  return [
    a * A + c * B,
    b * A + d * B,
    a * C + c * D,
    b * C + d * D,
    a * E + c * F + e,
    b * E + d * F + f,
  ];
}

function apply(matrix: Matrix6, x: number, y: number): [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
}

function translate(matrix: Matrix6, x: number, y: number): Matrix6 {
  return multiply(matrix, [1, 0, 0, 1, x, y]);
}

function clampByte(value: number): number {
  const scaled = value > 1 ? value : value * 255;
  return Math.max(0, Math.min(255, Math.round(scaled)));
}

function rgb(red: number, green: number, blue: number): string {
  const hex = (value: number) => clampByte(value).toString(16).padStart(2, '0');
  return `#${hex(red)}${hex(green)}${hex(blue)}`;
}

function cssColor(args: unknown): string | null {
  const list = Array.isArray(args) ? args : args == null ? [] : [args];
  const first = list[0];
  if (typeof first === 'string') {
    if (first === 'transparent' || first === 'none') return null;
    return first;
  }
  const nums = list.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (nums.length === 1) return rgb(nums[0], nums[0], nums[0]);
  if (nums.length === 3) return rgb(nums[0], nums[1], nums[2]);
  if (nums.length >= 4) {
    const [c, m, y, k] = nums;
    const black = k > 1 ? k / 255 : k;
    const channel = (ink: number) => (1 - (ink > 1 ? ink / 255 : ink)) * (1 - black);
    return rgb(channel(c) * 255, channel(m) * 255, channel(y) * 255);
  }
  return null;
}

function drawSequence(value: unknown): ArrayLike<number> | null {
  if (!value) return null;
  if (typeof (value as ArrayLike<number>)[0] === 'number') return value as ArrayLike<number>;
  const nested = (value as { 0?: unknown })[0];
  if (nested && typeof (nested as ArrayLike<number>)[0] === 'number') return nested as ArrayLike<number>;
  return null;
}

function mapPoint(state: Graphics, x: number, y: number, pageHeight: number): ArtworkPoint {
  const [px, py] = apply(state.ctm, x, y);
  return { x: px, y: pageHeight - py };
}

function commandsFromDraw(data: ArrayLike<number>, state: Graphics, pageHeight: number, close: boolean): ArtworkCommand[] {
  const commands: ArtworkCommand[] = [];
  for (let i = 0; i < data.length;) {
    const op = data[i++];
    if (op === DRAW_MOVE) commands.push({ op: 'M', ...mapPoint(state, data[i++], data[i++], pageHeight) });
    else if (op === DRAW_LINE) commands.push({ op: 'L', ...mapPoint(state, data[i++], data[i++], pageHeight) });
    else if (op === DRAW_CURVE) {
      const c1 = mapPoint(state, data[i++], data[i++], pageHeight);
      const c2 = mapPoint(state, data[i++], data[i++], pageHeight);
      const to = mapPoint(state, data[i++], data[i++], pageHeight);
      commands.push({ op: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: to.x, y: to.y });
    } else if (op === DRAW_QUAD) {
      const c1 = mapPoint(state, data[i++], data[i++], pageHeight);
      const to = mapPoint(state, data[i++], data[i++], pageHeight);
      commands.push({ op: 'Q', x1: c1.x, y1: c1.y, x: to.x, y: to.y });
    } else if (op === DRAW_CLOSE) commands.push({ op: 'Z' });
    else break;
  }
  if (close && commands.length > 0 && commands[commands.length - 1].op !== 'Z') commands.push({ op: 'Z' });
  return commands;
}

function strokeScale(ctm: Matrix6): number {
  const sx = Math.hypot(ctm[0], ctm[1]);
  const sy = Math.hypot(ctm[2], ctm[3]);
  const scale = (sx + sy) / 2;
  return scale > 0 ? scale : 1;
}

function paintKind(fn: number): { fill: boolean; stroke: boolean; evenOdd: boolean; close: boolean } | null {
  switch (fn) {
    case PDF_FN.fill: return { fill: true, stroke: false, evenOdd: false, close: false };
    case PDF_FN.eoFill: return { fill: true, stroke: false, evenOdd: true, close: false };
    case PDF_FN.stroke: return { fill: false, stroke: true, evenOdd: false, close: false };
    case PDF_FN.closeStroke: return { fill: false, stroke: true, evenOdd: false, close: true };
    case PDF_FN.fillStroke: return { fill: true, stroke: true, evenOdd: false, close: false };
    case PDF_FN.eoFillStroke: return { fill: true, stroke: true, evenOdd: true, close: false };
    case PDF_FN.closeFillStroke: return { fill: true, stroke: true, evenOdd: false, close: true };
    case PDF_FN.closeEOFillStroke: return { fill: true, stroke: true, evenOdd: true, close: true };
    default: return null;
  }
}

function textContent(args: unknown): { text: string; units: number } {
  const list = Array.isArray(args) ? args : [];
  const run = Array.isArray(list[0]) ? list[0] as unknown[] : list;
  let text = '';
  let units = 0;
  for (const part of run) {
    if (typeof part === 'number' && Number.isFinite(part)) units -= part;
    else if (typeof part === 'string') text += part;
    else if (part && typeof part === 'object') {
      const glyph = part as { unicode?: string; fontChar?: string; width?: number };
      const char = glyph.unicode || glyph.fontChar || '';
      text += char;
      if (typeof glyph.width === 'number') units += glyph.width;
    }
  }
  return { text, units };
}

function textOrigin(state: Graphics, pageHeight: number): { x: number; y: number; size: number; rotation: number } {
  const placed = multiply(state.ctm, state.textMatrix);
  const [x, y] = apply(placed, 0, 0);
  const size = Math.max(1, state.fontSize * strokeScale(placed));
  const rotation = Math.atan2(-placed[1], placed[0]) * 180 / Math.PI;
  return { x, y: pageHeight - y, size, rotation };
}

/** One PDF page as a group of paths, text, and nested groups. */
export function pdfOperatorsToGroup(
  fnArray: ArrayLike<number>,
  argsArray: ArrayLike<unknown>,
  pageHeight: number,
): PdfArtworkGroup {
  const state: Graphics = {
    ctm: [...IDENTITY],
    fill: '#000000',
    stroke: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    dash: null,
    fontSize: 12,
    leading: 0,
    textMatrix: [...IDENTITY],
    lineMatrix: [...IDENTITY],
  };
  const stack: Graphics[] = [];
  const root: PdfArtworkNode[] = [];
  const groups: PdfArtworkNode[][] = [root];
  const add = (node: PdfArtworkNode): void => { groups[groups.length - 1].push(node); };
  const pushGroup = (): void => {
    const group: PdfArtworkGroup = { kind: 'group', children: [] };
    add(group);
    groups.push(group.children);
  };
  const popGroup = (): void => {
    if (groups.length < 2) return;
    const children = groups.pop() as PdfArtworkNode[];
    const parent = groups[groups.length - 1];
    const last = parent[parent.length - 1];
    if (last && last.kind === 'group' && last.children === children && children.length === 0) parent.pop();
  };
  const addPath = (commands: ArtworkCommand[], paint: NonNullable<ReturnType<typeof paintKind>>): void => {
    if (commands.length === 0) return;
    const fill = paint.fill ? state.fill : null;
    const stroke = paint.stroke ? state.stroke : null;
    if (!fill && !stroke) return;
    add({
      kind: 'path',
      commands,
      fill,
      stroke,
      strokeWidth: state.lineWidth * strokeScale(state.ctm),
      lineCap: state.lineCap,
      lineJoin: state.lineJoin,
      dash: state.dash,
      evenOdd: paint.evenOdd,
    });
  };

  for (let index = 0; index < fnArray.length; index++) {
    const fn = fnArray[index];
    const args = argsArray[index];
    const list = Array.isArray(args) ? args : [];
    switch (fn) {
      case PDF_FN.save:
        stack.push(cloneGraphics(state));
        break;
      case PDF_FN.restore: {
        const previous = stack.pop();
        if (previous) Object.assign(state, previous);
        break;
      }
      case PDF_FN.transform:
        if (list.length >= 6) state.ctm = multiply(state.ctm, list.slice(0, 6) as Matrix6);
        break;
      case PDF_FN.setLineWidth:
        if (typeof list[0] === 'number') state.lineWidth = list[0];
        break;
      case PDF_FN.setLineCap:
        state.lineCap = list[0] === 1 ? 'round' : list[0] === 2 ? 'square' : 'butt';
        break;
      case PDF_FN.setLineJoin:
        state.lineJoin = list[0] === 1 ? 'round' : list[0] === 2 ? 'bevel' : 'miter';
        break;
      case PDF_FN.setDash:
        state.dash = Array.isArray(list[0]) ? (list[0] as number[]) : null;
        break;
      case PDF_FN.setFillRGBColor:
      case PDF_FN.setFillGray:
      case PDF_FN.setFillCMYKColor:
        state.fill = cssColor(list);
        break;
      case PDF_FN.setStrokeRGBColor:
      case PDF_FN.setStrokeGray:
      case PDF_FN.setStrokeCMYKColor:
        state.stroke = cssColor(list);
        break;
      case PDF_FN.setFillTransparent:
        state.fill = null;
        break;
      case PDF_FN.setStrokeTransparent:
        state.stroke = null;
        break;
      case PDF_FN.constructPath: {
        const paint = paintKind(typeof list[0] === 'number' ? list[0] : -1);
        const data = drawSequence(list[1]);
        if (paint && data) addPath(commandsFromDraw(data, state, pageHeight, paint.close), paint);
        break;
      }
      case PDF_FN.rectangle: {
        const [x, y, width, height] = list;
        if ([x, y, width, height].every((value) => typeof value === 'number')) {
          const commands = commandsFromDraw(
            [DRAW_MOVE, x, y, DRAW_LINE, x + width, y, DRAW_LINE, x + width, y + height, DRAW_LINE, x, y + height, DRAW_CLOSE],
            state, pageHeight, true,
          );
          addPath(commands, { fill: true, stroke: false, evenOdd: false, close: true });
        }
        break;
      }
      case PDF_FN.beginMarkedContent:
      case PDF_FN.beginMarkedContentProps:
      case PDF_FN.paintFormXObjectBegin:
      case PDF_FN.beginGroup:
        pushGroup();
        break;
      case PDF_FN.endMarkedContent:
      case PDF_FN.paintFormXObjectEnd:
      case PDF_FN.endGroup:
        popGroup();
        break;
      case PDF_FN.beginText:
        state.textMatrix = [...IDENTITY];
        state.lineMatrix = [...IDENTITY];
        break;
      case PDF_FN.endText:
        break;
      case PDF_FN.setFont:
        if (typeof list[1] === 'number' && list[1] > 0) state.fontSize = list[1];
        break;
      case PDF_FN.setLeading:
        if (typeof list[0] === 'number') state.leading = list[0];
        break;
      case PDF_FN.setTextMatrix:
        if (list.length >= 6) {
          state.textMatrix = list.slice(0, 6) as Matrix6;
          state.lineMatrix = [...state.textMatrix];
        }
        break;
      case PDF_FN.moveText:
      case PDF_FN.setLeadingMoveText: {
        if (fn === PDF_FN.setLeadingMoveText && typeof list[1] === 'number') state.leading = -list[1];
        const tx = typeof list[0] === 'number' ? list[0] : 0;
        const ty = typeof list[1] === 'number' ? list[1] : 0;
        state.lineMatrix = translate(state.lineMatrix, tx, ty);
        state.textMatrix = [...state.lineMatrix];
        break;
      }
      case PDF_FN.nextLine:
        state.lineMatrix = translate(state.lineMatrix, 0, -state.leading);
        state.textMatrix = [...state.lineMatrix];
        break;
      case PDF_FN.showText:
      case PDF_FN.showSpacedText:
      case PDF_FN.nextLineShowText:
      case PDF_FN.nextLineSetSpacingShowText: {
        if (fn === PDF_FN.nextLineShowText || fn === PDF_FN.nextLineSetSpacingShowText) {
          state.lineMatrix = translate(state.lineMatrix, 0, -state.leading);
          state.textMatrix = [...state.lineMatrix];
        }
        const { text, units } = textContent(list);
        if (text && state.fill) {
          const origin = textOrigin(state, pageHeight);
          add({ kind: 'text', content: text, fill: state.fill, ...origin });
        }
        state.textMatrix = translate(state.textMatrix, units / 1000 * state.fontSize, 0);
        break;
      }
      default:
        break;
    }
  }
  return { kind: 'group', children: root };
}

export function artworkNodeHasVectors(node: PdfArtworkNode): boolean {
  if (node.kind === 'path' || node.kind === 'text') return true;
  return node.children.some(artworkNodeHasVectors);
}

/** True when a placed Paper item contains a path, shape, or text. */
export function importedArtworkHasVectors(item: Item): boolean {
  if (!item || item.clipMask) return false;
  const name = item.className;
  if (name === 'Path' || name === 'CompoundPath' || name === 'PointText' || name === 'Shape') return true;
  const children = item.children as Item[] | undefined;
  if (!children) return false;
  return children.some((child) => importedArtworkHasVectors(child));
}

function markGroup(item: Item): void {
  if (item?.className !== 'Group') return;
  if (item.data?.shapeTextGroup || item.data?.isShapeText) return;
  try { item.data.isUserGroup = true; } catch { /* Grouping just won't apply. */ }
}

function adoptNode(item: Item): Item | null {
  if (!item || item.clipMask) {
    try { item?.remove(); } catch { /* Already gone. */ }
    return null;
  }
  if (item.className === 'SymbolItem' && item.definition?.item && typeof item.definition.item.clone === 'function') {
    try {
      const clone = item.definition.item.clone({ insert: false });
      if (typeof clone.insertAbove === 'function') clone.insertAbove(item);
      item.remove();
      return adoptNode(clone);
    } catch { /* Keep the symbol item. */ }
  }
  if (item.className === 'Shape' && typeof item.toPath === 'function') {
    const path = item.toPath(true);
    try { item.remove(); } catch { /* The path already replaced it. */ }
    return path || null;
  }
  const children = item.children ? [...item.children] as Item[] : null;
  if (children) {
    for (const child of children) adoptNode(child);
    markGroup(item);
    if (item.className === 'Group' && item.parent && (!item.children || item.children.length === 0)) {
      try { item.remove(); } catch { /* Already gone. */ }
      return null;
    }
  }
  return item;
}

/** Mark every nested group and expand shapes to paths. A loose path is wrapped. */
export function adoptImportedArtwork(
  scope: { Group: new (children?: Item[]) => Item },
  item: Item,
): Item | null {
  const adopted = adoptNode(item);
  if (!adopted) return null;
  if (adopted.className === 'Group' && (!adopted.children || adopted.children.length === 0)) return null;
  if (adopted.className !== 'Group') {
    const group = new scope.Group([adopted]);
    markGroup(group);
    return group;
  }
  markGroup(adopted);
  return adopted;
}

function buildContour(scope: any, commands: ArtworkCommand[]): Item | null {
  const path = new scope.Path({ insert: false });
  for (const command of commands) {
    if (command.op === 'M') path.moveTo(command);
    else if (command.op === 'L') path.lineTo(command);
    else if (command.op === 'C') path.cubicCurveTo(
      { x: command.x1, y: command.y1 },
      { x: command.x2, y: command.y2 },
      { x: command.x, y: command.y },
    );
    else if (command.op === 'Q') path.quadraticCurveTo(
      { x: command.x1, y: command.y1 },
      { x: command.x, y: command.y },
    );
    else if (command.op === 'Z') path.closePath();
  }
  if (!path.segments || path.segments.length === 0) {
    try { path.remove(); } catch { /* Nothing landed. */ }
    return null;
  }
  return path;
}

function stylePath(path: Item, node: PdfArtworkPath): void {
  path.fillColor = node.fill;
  path.strokeColor = node.stroke;
  path.strokeWidth = node.strokeWidth;
  path.strokeCap = node.lineCap;
  path.strokeJoin = node.lineJoin;
  if (node.dash && node.dash.length > 0) path.dashArray = node.dash;
  if (node.evenOdd) path.fillRule = 'evenodd';
}

/** Build a Paper item. Groups are NibGlider user groups. */
export function buildArtworkNode(scope: any, node: PdfArtworkNode): Item | null {
  if (node.kind === 'group') {
    const group = new scope.Group();
    markGroup(group);
    for (const child of node.children) {
      const built = buildArtworkNode(scope, child);
      if (built) group.addChild(built);
    }
    return group;
  }
  if (node.kind === 'text') {
    if (!node.content) return null;
    const text = new scope.PointText({
      insert: false,
      point: [node.x, node.y],
      content: node.content,
      fillColor: node.fill,
      fontSize: node.size,
    });
    if (node.rotation) text.rotation = node.rotation;
    return text;
  }
  const contours: ArtworkCommand[][] = [];
  let current: ArtworkCommand[] = [];
  for (const command of node.commands) {
    if (command.op === 'M' && current.length > 0) {
      contours.push(current);
      current = [];
    }
    current.push(command);
  }
  if (current.length > 0) contours.push(current);
  const paths = contours
    .map((commands) => buildContour(scope, commands))
    .filter((path): path is Item => !!path);
  if (paths.length === 0) return null;
  if (paths.length === 1) {
    stylePath(paths[0], node);
    return paths[0];
  }
  const compound = new scope.CompoundPath({ insert: false, children: paths });
  stylePath(compound, node);
  return compound;
}
