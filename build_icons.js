const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
}

const crcTable = createCRC32Table();
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crcBody = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(crcBody);

  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([len, crcBody, crcBuf]);
}

function generatePNG(size) {
  // Generate RGBA buffer
  const rawData = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;

  for (let y = 0; y < size; y++) {
    rawData[offset++] = 0; // Filter byte: None

    for (let x = 0; x < size; x++) {
      // Calculate normalized coordinates [-1, 1]
      const nx = (x / (size - 1)) * 2 - 1;
      const ny = (y / (size - 1)) * 2 - 1;
      const dist = Math.sqrt(nx * nx + ny * ny);

      // Rounded square background (squircle)
      const cornerRadius = 0.85;
      const isInsideSquircle = Math.pow(Math.abs(nx), 3.5) + Math.pow(Math.abs(ny), 3.5) <= Math.pow(cornerRadius, 3.5);

      if (!isInsideSquircle) {
        // Transparent
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        continue;
      }

      // Instagram gradient: Purple -> Pink -> Orange/Yellow
      // Gradient diagonal from bottom-left to top-right
      const t = (x + (size - y)) / (2 * size);
      let r, g, b;
      if (t < 0.5) {
        const factor = t / 0.5;
        // Purple (131, 58, 180) to Red/Pink (253, 29, 29)
        r = Math.round(131 + (253 - 131) * factor);
        g = Math.round(58 + (29 - 58) * factor);
        b = Math.round(180 + (29 - 180) * factor);
      } else {
        const factor = (t - 0.5) / 0.5;
        // Pink (253, 29, 29) to Yellow/Orange (252, 176, 69)
        r = Math.round(253 + (252 - 253) * factor);
        g = Math.round(29 + (176 - 29) * factor);
        b = Math.round(29 + (69 - 29) * factor);
      }

      // Draw simple musical note in the center
      // Note coordinates relative to center:
      // Note head 1 at bottom-left (-0.35, 0.25)
      // Note head 2 at bottom-right (0.15, 0.1)
      const dHead1 = Math.hypot(nx - (-0.25), (ny - 0.25) * 1.3);
      const dHead2 = Math.hypot(nx - (0.2), (ny + 0.05) * 1.3);
      
      // Vertical stems
      const isStem1 = (nx >= -0.15 && nx <= -0.05 && ny >= -0.35 && ny <= 0.25);
      const isStem2 = (nx >= 0.3 && nx <= 0.4 && ny >= -0.5 && ny <= 0.05);
      // Top beam
      const beamY = -0.35 - (nx - (-0.1)) * 0.3;
      const isBeam = (nx >= -0.15 && nx <= 0.4 && ny >= beamY - 0.12 && ny <= beamY);

      const isNote = (dHead1 < 0.22) || (dHead2 < 0.22) || isStem1 || isStem2 || isBeam;

      if (isNote) {
        // White note icon with slight soft edges
        rawData[offset++] = 255;
        rawData[offset++] = 255;
        rawData[offset++] = 255;
        rawData[offset++] = 255;
      } else {
        rawData[offset++] = r;
        rawData[offset++] = g;
        rawData[offset++] = b;
        rawData[offset++] = 255;
      }
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // no interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const buf = generatePNG(size);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buf);
  console.log(`Generated icon${size}.png (${buf.length} bytes)`);
});

