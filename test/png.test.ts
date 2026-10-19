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
  const png = catTemplatePng(['k.w', '...'], 3, 2);
  const raw = inflateSync(chunks(png).get('IDAT')!);
  // row 0: filter, k=opaque black, .=transparent, w=transparent
  assert.deepEqual([...raw.subarray(0, 13)], [0, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
});
