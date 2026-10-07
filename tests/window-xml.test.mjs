import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWindowXML } from '../src/ui/windowXML.ts';

const SETTINGS_URL = new URL('../src/ui/windows/settings.xml', import.meta.url);

test('settings window XML loads the Projection section with both switches', () => {
  const xml = readFileSync(SETTINGS_URL, 'utf8');
  const result = parseWindowXML(xml);
  assert.ok(!('error' in result), 'error' in result ? result.error : 'parse failed');
  const spec = result.spec;
  assert.equal(spec.id, 'settings');
  assert.equal(spec.sections.length, 2);
  const [section, text] = spec.sections;
  assert.equal(section.id, 'projection');
  assert.equal(section.controls.length, 2);
  const [mapping, circle] = section.controls;
  assert.equal(mapping.kind, 'switch');
  assert.equal(mapping.key, 'quadMapping');
  assert.deepEqual(mapping.options.map((o) => o.value), ['bilinear', 'projective']);
  assert.deepEqual(mapping.options.map((o) => o.label), ['Bilinear', 'Perspective']);
  assert.equal(circle.kind, 'toggle');
  assert.equal(circle.key, 'perspectiveCircle');
  assert.equal(text.id, 'text');
  assert.equal(text.controls.length, 1);
  const [pasteLocation] = text.controls;
  assert.equal(pasteLocation.kind, 'switch');
  assert.equal(pasteLocation.key, 'textPasteLocation');
  assert.equal(pasteLocation.label, 'Text pastes at Location');
  assert.deepEqual(pasteLocation.options.map((o) => o.value), ['crosshair', 'view-center']);
});

test('window XML falls back to ids and rejects malformed definitions', () => {
  const minimal = parseWindowXML('<window id="w"><section id="s"><toggle key="k"/></section></window>');
  assert.ok('spec' in minimal);
  assert.equal(minimal.spec.title, 'w');
  assert.equal(minimal.spec.sections[0].title, 's');
  assert.equal(minimal.spec.sections[0].controls[0].label, 'k');

  for (const bad of [
    '<window><section id="s"/></window>',
    '<window id="w"><section/></window>',
    '<window id="w"><section id="s"><switch key="k"><option value="a"/></switch></section></window>',
    '<window id="w"><section id="s"><switch key="k"/></section></window>',
    '<window id="w"><section id="s"><slider key="k"/></section></window>',
    '<window id="w"><section id="s"><toggle/></section></window>',
    '<window id="w"><section id="s"><toggle key="k"><option/></toggle></section></window>',
    '<window id="w"><section id="s">hello</section></window>',
    '<window id="w"><section id="s"></window>',
    '<dialog id="w"/>',
    'not xml at all',
    '',
  ]) {
    const result = parseWindowXML(bad);
    assert.ok('error' in result, `expected an error for ${bad}`);
    assert.ok(result.error.length > 0);
  }
});

test('tab views group sections and bare controls, with flattened sections', () => {
  const result = parseWindowXML(
    '<window id="w" title="W"><tabview>' +
    '<tab id="size" title="Size"><custom id="document-size"/></tab>' +
    '<tab id="page"><section id="page" title="Page"><toggle key="pageFill"/></section></tab>' +
    '</tabview></window>',
  );
  assert.ok('spec' in result);
  assert.deepEqual(result.spec.tabs.map((tab) => tab.id), ['size', 'page']);
  assert.equal(result.spec.tabs[1].title, 'page');
  assert.deepEqual(result.spec.tabs[0].sectionIds, ['size-content']);
  assert.deepEqual(result.spec.tabs[1].sectionIds, ['page']);
  // Sections stay flattened so untabbed readers keep working.
  assert.deepEqual(result.spec.sections.map((s) => s.id), ['size-content', 'page']);
  const anonymous = result.spec.sections[0];
  assert.equal(anonymous.title, '');
  assert.deepEqual(anonymous.controls, [{ kind: 'custom', id: 'document-size' }]);

  // Windows without tabs parse exactly as before, with no tab strip.
  const plain = parseWindowXML('<window id="w"><section id="s"><toggle key="k"/></section></window>');
  assert.ok('spec' in plain);
  assert.deepEqual(plain.spec.tabs, []);

  for (const bad of [
    '<window id="w"><tab id="t"><section id="s"/></tab></window>',
    '<window id="w"><tabview></tabview></window>',
    '<window id="w"><tabview id="v"><tab id="t"><section id="s"/></tab></tabview></window>',
    '<window id="w"><tabview><section id="s"/></tabview></window>',
    '<window id="w"><tabview><tab id="t"><section id="s"/></tab><tab id="t"><section id="s"/></tab></tabview></window>',
    '<window id="w"><tabview><tab><section id="s"/></tab></tabview></window>',
    '<window id="w"><tabview><tab id="t"></tab></tabview></window>',
    '<window id="w"><tabview><tab id="t"><section id="s"/><section id="s"/></tab></tabview></window>',
    '<window id="w"><tabview><tab id="t"><section id="a"/></tab></tabview><tabview><tab id="b"><section id="s"/></tab></tabview></window>',
    '<window id="w"><tabview><tab id="t"><custom/></tab></tabview></window>',
    '<window id="w"><tabview><tab id="t"><custom id="c"><toggle key="k"/></custom></tab></tabview></window>',
    '<window id="w"><tabview><tab id="t"><slider key="k"/></tab></tabview></window>',
    '<window id="w"><section id="s-content"/><tabview><tab id="s"><toggle key="k"/></tab></tabview></window>',
  ]) {
    const parsed = parseWindowXML(bad);
    assert.ok('error' in parsed, `expected an error for ${bad}`);
    assert.ok(parsed.error.length > 0);
  }
});

test('window XML handles comments, prologs, entities, and quote styles', () => {
  const result = parseWindowXML(
    '<?xml version="1.0"?><!-- a comment -->' +
    '<window id="w" title="A &amp; B"><section id="s">' +
    "<toggle key='k' label='It&apos;s'/>" +
    '</section></window>',
  );
  assert.ok('spec' in result);
  assert.equal(result.spec.title, 'A & B');
  assert.equal(result.spec.sections[0].controls[0].label, "It's");
});
