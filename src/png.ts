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
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const phys = Buffer.alloc(9);
  phys.writeUInt32BE(PPM_2X, 0);
  phys.writeUInt32BE(PPM_2X, 4);
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
 * bar tints it like any other icon and the cat reads as line art, Mac-style.
 */
export function catTemplatePng(rows: readonly string[], width: number, height: number): Buffer {
  const rgba = new Uint8Array(width * height * 4);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === 'k') rgba[(y * width + x) * 4 + 3] = 255;
    });
  });
  return encodePng(width, height, rgba);
}
