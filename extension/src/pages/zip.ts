// OpenMonkey for Safari — minimal ZIP utility (stored entries only).
//
// Clean-room implementation of the ZIP format's "stored" (method 0,
// no compression) entries, written from the ZIP file-format
// specification. No zip dependency is used. Files are stored
// uncompressed, which keeps the implementation small and auditable;
// the trade-off is larger archives for large scripts, which is
// acceptable for a script backup format.
//
// Writer: createZip(files) -> Uint8Array (local headers + central
// directory + end-of-central-directory record).
// Reader: parseZip(data) -> [{name, data}] for stored entries only.
// A deflate (method 8) entry is rejected with a clear error instead of
// silently producing corrupt output.

export interface ZipEntryInput {
  name: string;
  data: string | Uint8Array;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const dosDate =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { time, date: dosDate };
}

/** Build a ZIP archive (stored entries) from the given files. */
export function createZip(files: ZipEntryInput[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const now = dosDateTime(new Date());

  const push = (target: Uint8Array[], bytes: Uint8Array): void => {
    target.push(bytes);
  };

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const data = toBytes(file.data);
    const crc = crc32(data);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true); // local file header signature
    header.setUint16(4, 20, true); // version needed to extract
    header.setUint16(6, 0x0800, true); // flags: UTF-8 filenames
    header.setUint16(8, 0, true); // method: stored
    header.setUint16(10, now.time, true);
    header.setUint16(12, now.date, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, data.length, true); // compressed size (= stored)
    header.setUint32(22, data.length, true); // uncompressed size
    header.setUint16(26, nameBytes.length, true);
    header.setUint16(28, 0, true); // extra field length
    const localHeader = new Uint8Array(header.buffer);
    push(chunks, localHeader);
    push(chunks, nameBytes);
    push(chunks, data);

    const centralHeader = new DataView(new ArrayBuffer(46));
    centralHeader.setUint32(0, 0x02014b50, true); // central header signature
    centralHeader.setUint16(4, 20, true); // version made by
    centralHeader.setUint16(6, 20, true); // version needed to extract
    centralHeader.setUint16(8, 0x0800, true);
    centralHeader.setUint16(10, 0, true); // method: stored
    centralHeader.setUint16(12, now.time, true);
    centralHeader.setUint16(14, now.date, true);
    centralHeader.setUint32(16, crc, true);
    centralHeader.setUint32(20, data.length, true);
    centralHeader.setUint32(24, data.length, true);
    centralHeader.setUint16(28, nameBytes.length, true);
    centralHeader.setUint16(30, 0, true); // extra field length
    centralHeader.setUint16(32, 0, true); // comment length
    centralHeader.setUint16(34, 0, true); // disk number
    centralHeader.setUint16(36, 0, true); // internal attributes
    centralHeader.setUint32(38, 0, true); // external attributes
    centralHeader.setUint32(42, offset, true); // local header offset
    push(central, new Uint8Array(centralHeader.buffer));
    push(central, nameBytes);

    offset += localHeader.length + nameBytes.length + data.length;
  }

  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); // end of central directory signature
  eocd.setUint16(4, 0, true);
  eocd.setUint16(6, 0, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);
  eocd.setUint16(20, 0, true);

  const total = offset + centralSize + eocd.byteLength;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of [...chunks, ...central, new Uint8Array(eocd.buffer)]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

/** Parse a ZIP archive. Only stored (method 0) entries are supported. */
export function parseZip(data: Uint8Array): ZipEntry[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const entries: ZipEntry[] = [];
  let offset = 0;
  while (offset + 4 <= data.length) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x06054b50) break; // end of central directory
    if (signature !== 0x04034b50) {
      throw new Error(`Invalid ZIP: expected a local file header at offset ${offset}.`);
    }
    if (offset + 30 > data.length) throw new Error('Invalid ZIP: truncated local file header.');
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    if (dataStart + compressedSize > data.length) {
      throw new Error('Invalid ZIP: truncated file data.');
    }
    if (method !== 0) {
      throw new Error(
        'Unsupported ZIP entry: only stored (uncompressed) entries can be imported. ' +
          'Re-export the archive without compression and try again.',
      );
    }
    const name = new TextDecoder().decode(data.subarray(nameStart, nameStart + nameLength));
    entries.push({ name, data: data.slice(dataStart, dataStart + compressedSize) });
    offset = dataStart + compressedSize;
  }
  if (entries.length === 0) throw new Error('Invalid ZIP: no files found.');
  return entries;
}

/** Trigger a download of the given bytes in the browser. */
export function downloadBlob(bytes: BlobPart | Uint8Array, filename: string, mimeType: string): void {
  // Uint8Array<ArrayBufferLike> is not assignable to BlobPart under TS 5.9's
  // strict lib.dom types; slice() yields a Uint8Array<ArrayBuffer>, which is.
  const part: BlobPart = bytes instanceof Uint8Array ? bytes.slice() : bytes;
  const blob = new Blob([part], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** File-system-safe name for a downloaded script file. */
export function safeFilename(name: string, extension: string): string {
  const base = (name || 'script').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '-').slice(0, 80) || 'script';
  return `${base}${extension}`;
}
