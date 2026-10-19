import { crc32, deflateSync } from 'node:zlib';

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** 144 dpi in pixels per metre: macOS then draws the image at half its pixel size (retina). */
const PPM_2X = 5669;

/** Minimal RGBA PNG encoder (no filters), enough for menu bar icons. */
export function encodePng(width: number, height: number, rgba: Uint8Array, pixelsPerMetre = PPM_2X): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const phys = Buffer.alloc(9);
  phys.writeUInt32BE(pixelsPerMetre, 0);
  phys.writeUInt32BE(pixelsPerMetre, 4);
  phys[8] = 1; // unit: metre
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (1 + width * 4) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('pHYs', phys),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * A 1-bit sprite as a macOS template image: only the outline ('k') is opaque, so the menu
 * bar tints it like any other icon and the cat reads as line art, Mac-style. Cropped to the
 * outline and given a density that makes it exactly `heightPt` tall: sprites carry empty
 * margins that would otherwise shrink the cat.
 */
export function catTemplatePng(
  rows: readonly string[],
  width: number,
  height: number,
  heightPt: number,
  /** Outline color; black (the default) is what a template image wants. */
  rgb: readonly [number, number, number] = [0, 0, 0],
): Buffer {
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== 'k') return;
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }),
  );
  if (x1 < 0) [x0, y0, x1, y1] = [0, 0, width - 1, height - 1];
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rows[y0 + y]?.[x0 + x] === 'k') rgba.set([rgb[0], rgb[1], rgb[2], 255], (y * w + x) * 4);
    }
  }
  // h px over heightPt points at 72 pt/inch.
  return encodePng(w, h, rgba, Math.round((h / heightPt) * (72 / 0.0254)));
}
