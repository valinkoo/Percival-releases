/** Small real files (the server checks the content, not the name) and a multipart body builder. */

/** A 1x1 PNG. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** The smallest thing recognised as a JPEG: the start-of-image marker and a JFIF header. */
export const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

export const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

/** An empty ZIP archive: just its end-of-central-directory record. */
export const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(18)]);

/** A Windows program: the "MZ" header followed by padding. */
export const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(126)]);

export const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);

export const TEXT = Buffer.from('Notes du jour\n- premier\n- deuxième\n');

export interface FilePart {
  name: string;
  data: Buffer;
  /** The type the "browser" claims. The server must not trust it. Defaults to octet-stream. */
  declaredType?: string;
  field?: string;
}

/** Encodes a `multipart/form-data` body the way a browser does, ready for `app.inject`. */
export async function multipartBody(
  fields: Record<string, string>,
  files: FilePart[] = [],
): Promise<{ payload: Buffer; headers: { 'content-type': string } }> {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  for (const file of files) {
    const blob = new Blob([new Uint8Array(file.data)], {
      type: file.declaredType ?? 'application/octet-stream',
    });
    form.append(file.field ?? 'files', blob, file.name);
  }
  const response = new Response(form);
  const contentType = response.headers.get('content-type');
  if (!contentType) throw new Error('FormData produced no content type');
  return {
    payload: Buffer.from(await response.arrayBuffer()),
    headers: { 'content-type': contentType },
  };
}
