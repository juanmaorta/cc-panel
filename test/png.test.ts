import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { catTemplatePng, encodePng } from '../src/png.ts';

function chunks(png: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let off = 8;
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString('ascii', off + 4, off + 8);
    out.set(type, png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  return out;
}

test('encodes a valid RGBA PNG with 2x density', () => {
  const rgba = new Uint8Array(2 * 1 * 4);
  rgba.set([255, 0, 0, 255, 0, 0, 0, 0]);
  const png = encodePng(2, 1, rgba);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const c = chunks(png);
  const ihdr = c.get('IHDR')!;
  assert.equal(ihdr.readUInt32BE(0), 2);
  assert.equal(ihdr.readUInt32BE(4), 1);
  assert.equal(ihdr[8], 8, 'bit depth');
  assert.equal(ihdr[9], 6, 'RGBA');
  assert.equal(c.get('pHYs')!.readUInt32BE(0), 5669, '144 dpi');
  const raw = inflateSync(c.get('IDAT')!);
  assert.deepEqual([...raw], [0, 255, 0, 0, 255, 0, 0, 0, 0], 'filter byte + pixels');
  assert.ok(c.has('IEND'));
});

test('cat template: outline opaque, everything else transparent', () => {
  const png = catTemplatePng(['k.w', 'k..'], 3, 2, 18);
  const raw = inflateSync(chunks(png).get('IDAT')!);
  // cropped to the outline (1 px wide): row 0 = filter byte + one opaque black pixel
  assert.deepEqual([...raw.subarray(0, 5)], [0, 0, 0, 0, 255]);
});

test('cat template is cropped to its outline and sized to the menu bar height', () => {
  const rows = ['....', '.k..', '.kk.', '....'];
  const c = chunks(catTemplatePng(rows, 4, 4, 18));
  const ihdr = c.get('IHDR')!;
  assert.equal(ihdr.readUInt32BE(0), 2, 'cropped width');
  assert.equal(ihdr.readUInt32BE(4), 2, 'cropped height');
  // 2 px must render as 18 pt: 2 / 18 * 72 dpi = 8 dpi = 314.96 px/m
  assert.equal(c.get('pHYs')!.readUInt32BE(0), Math.round((2 / 18) * (72 / 0.0254)));
});
