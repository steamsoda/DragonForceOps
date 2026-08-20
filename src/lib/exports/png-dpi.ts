const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_PIXELS_PER_METER_PER_DPI = 39.37007874015748;

function readUint32(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

function writeUint32(bytes: Uint8Array, offset: number, value: number) {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value);
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makePhysChunk(dpi: number) {
  const pixelsPerMeter = Math.round(dpi * PNG_PIXELS_PER_METER_PER_DPI);
  const chunk = new Uint8Array(21);
  writeUint32(chunk, 0, 9);
  chunk.set([112, 72, 89, 115], 4);
  writeUint32(chunk, 8, pixelsPerMeter);
  writeUint32(chunk, 12, pixelsPerMeter);
  chunk[16] = 1;
  writeUint32(chunk, 17, crc32(chunk.subarray(4, 17)));
  return chunk;
}

export async function setPngDpi(blob: Blob, dpi: number) {
  const source = new Uint8Array(await blob.arrayBuffer());
  if (source.length < 33 || !PNG_SIGNATURE.every((byte, index) => source[index] === byte)) {
    throw new Error("invalid_png");
  }

  const parts: Uint8Array[] = [source.subarray(0, 8)];
  let offset = 8;
  let inserted = false;

  while (offset + 12 <= source.length) {
    const length = readUint32(source, offset);
    const end = offset + 12 + length;
    if (end > source.length) throw new Error("invalid_png_chunk");

    const type = String.fromCharCode(...source.subarray(offset + 4, offset + 8));
    if (type !== "pHYs") parts.push(source.subarray(offset, end));
    if (type === "IHDR" && !inserted) {
      parts.push(makePhysChunk(dpi));
      inserted = true;
    }
    offset = end;
  }

  if (!inserted || offset !== source.length) throw new Error("invalid_png_structure");
  const size = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(size);
  let outputOffset = 0;
  for (const part of parts) {
    output.set(part, outputOffset);
    outputOffset += part.byteLength;
  }
  return new Blob([output.buffer], { type: "image/png" });
}
