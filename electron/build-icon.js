// Convert PNG to a valid multi-size ICO file
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const INPUT = path.join(__dirname, "..", "public", "logo.png");
const OUTPUT = path.join(__dirname, "..", "public", "logo.ico");

// ICO sizes needed by Windows / electron-builder
const SIZES = [16, 24, 32, 48, 64, 128, 256];

async function pngToIco() {
  const pngBuffers = await Promise.all(
    SIZES.map((size) =>
      sharp(INPUT)
        .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    )
  );

  // Build ICO binary manually (no dependency needed)
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dataOffset = headerSize + dirEntrySize * numImages;

  // Calculate offsets
  let currentOffset = dataOffset;
  const offsets = pngBuffers.map((buf) => {
    const off = currentOffset;
    currentOffset += buf.length;
    return off;
  });

  // ICO header: reserved(2) + type(2) + count(2)
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = 1 (ICO)
  header.writeUInt16LE(numImages, 4);

  // Directory entries
  const dirEntries = Buffer.alloc(dirEntrySize * numImages);
  for (let i = 0; i < numImages; i++) {
    const size = SIZES[i];
    const offset = i * dirEntrySize;
    dirEntries.writeUInt8(size < 256 ? size : 0, offset + 0); // width
    dirEntries.writeUInt8(size < 256 ? size : 0, offset + 1); // height
    dirEntries.writeUInt8(0, offset + 2); // color palette
    dirEntries.writeUInt8(0, offset + 3); // reserved
    dirEntries.writeUInt16LE(1, offset + 4); // color planes
    dirEntries.writeUInt16LE(32, offset + 6); // bits per pixel
    dirEntries.writeUInt32LE(pngBuffers[i].length, offset + 8); // image size
    dirEntries.writeUInt32LE(offsets[i], offset + 12); // image offset
  }

  const ico = Buffer.concat([header, dirEntries, ...pngBuffers]);
  fs.writeFileSync(OUTPUT, ico);
  console.log(`Created ${OUTPUT} (${ico.length} bytes, ${numImages} sizes)`);
}

pngToIco().catch((err) => {
  console.error(err);
  process.exit(1);
});
