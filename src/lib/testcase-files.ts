// Helpers for the blog's test-case panels: truncated previews of large
// inputs/outputs, single-file downloads, and a dependency-free "store"
// (uncompressed) zip so every case can be downloaded in one click.

export interface Preview {
  text: string;
  truncated: boolean;
  totalChars: number;
  totalLines: number;
}

/** First `maxLines` lines / `maxChars` chars of `s`, with very long lines clipped too. */
export function previewText(s: string, maxLines = 20, maxChars = 1500, maxLineChars = 200): Preview {
  const lines = s.replace(/\n$/, "").split("\n");
  const shown: string[] = [];
  let used = 0;
  let truncated = lines.length > maxLines;
  for (const line of lines.slice(0, maxLines)) {
    let l = line;
    if (l.length > maxLineChars) {
      l = `${l.slice(0, maxLineChars)} …`;
      truncated = true;
    }
    if (used + l.length > maxChars) {
      shown.push(l.slice(0, Math.max(0, maxChars - used)));
      truncated = true;
      break;
    }
    shown.push(l);
    used += l.length + 1;
  }
  return { text: shown.join("\n"), truncated, totalChars: s.length, totalLines: lines.length };
}

export function formatSize(chars: number): string {
  if (chars < 1024) return `${chars} B`;
  if (chars < 1024 * 1024) return `${(chars / 1024).toFixed(1)} KB`;
  return `${(chars / 1024 / 1024).toFixed(1)} MB`;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, filename: string): void {
  saveBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), filename);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Builds an uncompressed .zip of text and/or binary files and downloads it. */
export function downloadZip(files: { name: string; text?: string; bytes?: Uint8Array<ArrayBuffer> }[], filename: string): void {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.bytes ?? enc.encode(f.text ?? "");
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(12, 0x21, true); // DOS date 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(14, 0x21, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, data.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);

    offset += 30 + name.length + data.length;
  }

  const centralSize = central.reduce((n, p) => n + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  saveBlob(new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" }), filename);
}

/** First differing line between expected and actual (both already trimmed), or null if equal. */
export function firstDiff(expected: string, actual: string): { line: number; expected: string; actual: string } | null {
  const e = expected.split("\n");
  const a = actual.split("\n");
  for (let i = 0; i < Math.max(e.length, a.length); i++) {
    if ((e[i] ?? "").trimEnd() !== (a[i] ?? "").trimEnd()) {
      return { line: i + 1, expected: e[i] ?? "(end of output)", actual: a[i] ?? "(end of output)" };
    }
  }
  return null;
}
