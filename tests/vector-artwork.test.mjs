import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adoptImportedArtwork,
  artworkNodeHasVectors,
  buildArtworkNode,
  PDF_FN,
  pdfOperatorsToGroup,
} from '../src/engine/document/vectorArtwork.ts';

// Minimal Paper stand-ins: remove() detaches from the parent like the real
// item graph, toPath(true) inserts the replacement like Paper's Shape.
class FakeItem {
  constructor(className) {
    this.className = className;
    this.children = [];
    this.data = {};
    this.clipMask = false;
    this.parent = null;
    this.removed = false;
  }
  remove() {
    if (this.parent) {
      const at = this.parent.children.indexOf(this);
      if (at >= 0) this.parent.children.splice(at, 1);
      this.parent = null;
    }
    this.removed = true;
  }
}

class FakeGroup extends FakeItem {
  constructor(children = []) {
    super('Group');
    for (const child of children ?? []) this.addChild(child);
  }
  addChild(child) {
    this.children.push(child);
    child.parent = this;
  }
}

class FakePath extends FakeItem {
  constructor() {
    super('Path');
    this.segments = [];
  }
  moveTo(point) { this.segments.push({ point: { ...point } }); }
  lineTo(point) { this.segments.push({ point: { ...point } }); }
  cubicCurveTo() { this.segments.push({}); }
  quadraticCurveTo() { this.segments.push({}); }
  closePath() { this.segments.push({ closed: true }); }
}

class FakeShape extends FakeItem {
  constructor() {
    super('Shape');
  }
  toPath() {
    const path = new FakePath();
    if (this.parent) {
      const at = this.parent.children.indexOf(this);
      this.parent.children.splice(at + 1, 0, path);
      path.parent = this.parent;
    }
    return path;
  }
}

class FakePointText extends FakeItem {
  constructor(options = {}) {
    super('PointText');
    this.children = undefined;
    this.point = options.point;
    this.content = options.content;
    this.fillColor = options.fillColor;
    this.fontSize = options.fontSize;
    this.rotation = 0;
  }
}

class FakeCompoundPath extends FakeItem {
  constructor(options = {}) {
    super('CompoundPath');
    for (const child of options.children ?? []) {
      this.children.push(child);
      child.parent = this;
    }
  }
}

const scope = {
  Group: FakeGroup,
  Path: FakePath,
  PointText: FakePointText,
  CompoundPath: FakeCompoundPath,
};

function fillTriangleArgs(color = [1, 0, 0]) {
  return {
    fnArray: [PDF_FN.setFillRGBColor, PDF_FN.constructPath],
    argsArray: [color, [PDF_FN.fill, [0, 10, 20, 1, 30, 20, 1, 30, 40, 4]]],
  };
}

test('pdfOperatorsToGroup recovers a filled path with color and flipped y', () => {
  const { fnArray, argsArray } = fillTriangleArgs();
  const group = pdfOperatorsToGroup(fnArray, argsArray, 100);
  assert.equal(group.kind, 'group');
  assert.equal(group.children.length, 1);
  const path = group.children[0];
  assert.equal(path.kind, 'path');
  assert.equal(path.fill, '#ff0000');
  assert.equal(path.stroke, null);
  assert.deepEqual(path.commands[0], { op: 'M', x: 10, y: 80 });
  assert.deepEqual(path.commands[path.commands.length - 1], { op: 'Z' });
});

test('pdfOperatorsToGroup nests marked-content groups and prunes empty ones', () => {
  const { fnArray, argsArray } = fillTriangleArgs();
  const nested = pdfOperatorsToGroup(
    [PDF_FN.beginGroup, ...fnArray, PDF_FN.endGroup, PDF_FN.beginGroup, PDF_FN.endGroup],
    [[], ...argsArray, [], [], []],
    100,
  );
  assert.equal(nested.children.length, 1);
  assert.equal(nested.children[0].kind, 'group');
  assert.equal(nested.children[0].children.length, 1);
  assert.equal(nested.children[0].children[0].kind, 'path');
});

test('artworkNodeHasVectors distinguishes empty groups from paths and text', () => {
  assert.equal(artworkNodeHasVectors({ kind: 'group', children: [] }), false);
  const { fnArray, argsArray } = fillTriangleArgs();
  const group = pdfOperatorsToGroup(fnArray, argsArray, 100);
  assert.equal(artworkNodeHasVectors(group), true);
  assert.equal(artworkNodeHasVectors({ kind: 'text', content: 'Hi' }), true);
});

test('adoptImportedArtwork marks nested groups, expands shapes, drops clip masks', () => {
  const clip = new FakePath();
  clip.clipMask = true;
  const shape = new FakeShape();
  const inner = new FakeGroup([shape, clip, new FakePath()]);
  const outer = new FakeGroup([inner]);
  const adopted = adoptImportedArtwork(scope, outer);
  assert.equal(adopted, outer);
  assert.equal(outer.data.isUserGroup, true);
  assert.equal(inner.data.isUserGroup, true);
  assert.ok(inner.children.every((child) => child.className === 'Path'));
  assert.equal(inner.children.length, 2);
});

test('adoptImportedArtwork wraps a loose path so ungroup cannot delete it', () => {
  const loose = new FakePath();
  loose.segments.push({});
  const adopted = adoptImportedArtwork(scope, loose);
  assert.ok(adopted instanceof FakeGroup);
  assert.equal(adopted.data.isUserGroup, true);
  assert.deepEqual(adopted.children, [loose]);
});

test('buildArtworkNode builds a marked group of styled paths and text', () => {
  const group = buildArtworkNode(scope, {
    kind: 'group',
    children: [
      {
        kind: 'path',
        commands: [{ op: 'M', x: 1, y: 2 }, { op: 'L', x: 3, y: 4 }, { op: 'Z' }],
        fill: '#ff0000',
        stroke: null,
        strokeWidth: 2,
        lineCap: 'butt',
        lineJoin: 'miter',
        dash: null,
        evenOdd: false,
      },
      { kind: 'text', x: 5, y: 6, size: 12, rotation: 0, content: 'Hi', fill: '#000000' },
    ],
  });
  assert.ok(group instanceof FakeGroup);
  assert.equal(group.data.isUserGroup, true);
  assert.equal(group.children.length, 2);
  assert.ok(group.children[0] instanceof FakePath);
  assert.equal(group.children[0].fillColor, '#ff0000');
  assert.ok(group.children[0].segments.length > 0);
  assert.ok(group.children[1] instanceof FakePointText);
  assert.equal(group.children[1].content, 'Hi');
});
