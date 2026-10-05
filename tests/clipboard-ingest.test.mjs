import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyClipboardText,
  decodeRtf,
  htmlToPlainText,
  isMultilineText,
  richTextToPlainText,
  splitBodyLines,
  stripMarkdown,
} from '../src/engine/document/clipboardIngest.ts';

test('classifier prefers scene and svg over markup sniffing', () => {
  const scene = JSON.stringify({ format: 'nibglider-scene', version: 1, items: [] });
  assert.equal(classifyClipboardText(scene), 'scene');
  assert.equal(classifyClipboardText('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'), 'svg');
  assert.equal(classifyClipboardText('{\\rtf1\\ansi Hello}'), 'rtf');
  assert.equal(classifyClipboardText('<p>Hello <b>world</b></p>'), 'html');
  assert.equal(classifyClipboardText('# Hello'), 'text');
  assert.equal(classifyClipboardText('   '), 'empty');
});

test('html degrades to plain text with structure', () => {
  assert.equal(htmlToPlainText('<p>Hello <b>world</b></p><p>Bye</p>'), 'Hello world\nBye');
  assert.equal(htmlToPlainText('a<br>b'), 'a\nb');
  assert.equal(htmlToPlainText('<ul><li>one</li><li>two</li></ul>'), '• one\n• two');
  assert.equal(htmlToPlainText('fish &amp; chips'), 'fish & chips');
  assert.equal(htmlToPlainText('<script>x()</script>hi'), 'hi');
});

test('markdown keeps readable content only', () => {
  assert.equal(stripMarkdown('# Title'), 'Title');
  assert.equal(stripMarkdown('**bold** and *italic*'), 'bold and italic');
  assert.equal(stripMarkdown('[label](https://example.com)'), 'label');
  assert.equal(stripMarkdown('![alt](img.png)'), 'alt');
  assert.equal(stripMarkdown('```js\nconst x = 1;\n```'), 'const x = 1;');
  assert.equal(stripMarkdown('`code`'), 'code');
  assert.equal(stripMarkdown('- one\n- two'), 'one\ntwo');
  assert.equal(stripMarkdown('> quoted'), 'quoted');
  assert.equal(stripMarkdown('para one\n\n---\n\npara two'), 'para one\n\npara two');
});

test('rtf decodes paragraphs, escapes, and skips font tables', () => {
  const rtf = '{\\rtf1\\ansi{\\fonttbl{\\f0 Helvetica;}}Hello\\par World\\par}';
  assert.equal(decodeRtf(rtf), 'Hello\nWorld');
  assert.equal(decodeRtf('{\\rtf1 caf\\u233?x}'), 'caféx');
  assert.equal(decodeRtf("{\\rtf1 don\\'e9e}"), 'donée');
  assert.equal(decodeRtf('{\\rtf1 a\\tab b}'), 'a\tb');
  assert.equal(decodeRtf('{\\rtf1 {\\colortbl;\\red255;}plain}'), 'plain');
});

test('rich dispatch and multiline detection', () => {
  assert.equal(richTextToPlainText('<p>a</p>'), 'a');
  assert.equal(richTextToPlainText('**b**'), 'b');
  assert.equal(richTextToPlainText('{\\rtf1\\ansi hi\\par}'), 'hi');
  assert.equal(isMultilineText('one\ntwo'), true);
  assert.equal(isMultilineText('single'), false);
  assert.deepEqual(splitBodyLines('\r\n\none\r\ntwo\n\n'), ['one', 'two']);
  assert.deepEqual(splitBodyLines('  '), [' ']);
});
