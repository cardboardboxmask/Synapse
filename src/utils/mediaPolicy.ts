/**
 * Production Media & Firebase Storage Security Policy
 *
 * Defines allowed MIME types, file size ceilings, magic-byte signature validation,
 * and deterministic ownership storage paths for avatars and specification diagrams.
 */

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_SPEC_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const AVATAR_UPLOAD_POLICY = {
  maxBytes: MAX_AVATAR_SIZE_BYTES,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
};

export async function validateMediaFileSignature(
  file: File,
  policy: { maxBytes: number; allowedMimeTypes: string[] } = AVATAR_UPLOAD_POLICY
): Promise<MediaValidationResult> {
  if (!policy.allowedMimeTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Unsupported file format. Only JPEG, PNG, and WebP images are permitted.',
    };
  }
  if (file.size <= 0 || file.size > policy.maxBytes) {
    return {
      valid: false,
      error: `File size exceeds maximum limit of ${Math.round(policy.maxBytes / (1024 * 1024))}MB.`,
    };
  }
  const magicValid = await verifyImageMagicBytes(file);
  if (!magicValid) {
    return {
      valid: false,
      error: 'File header signature does not match a valid JPEG, PNG, or WebP image.',
    };
  }
  return {
    valid: true,
    sanitizedFileName: `${Date.now()}-${sanitizeStorageFileName(file.name)}`,
  };
}

export interface MediaValidationResult {
  valid: boolean;
  error?: string;
  sanitizedFileName?: string;
}

export function sanitizeStorageFileName(fileName: string): string {
  const base = fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return base || 'asset.bin';
}

/**
 * Inspects the first 12 magic bytes of a file buffer to verify it is a genuine
 * JPEG, PNG, or WebP image—never trusting client-provided filename or MIME type alone.
 */
export async function verifyImageMagicBytes(file: Blob): Promise<boolean> {
  try {
    const slice = file.slice(0, 12);
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 4) return false;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    const isPng =
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47;

    // JPEG: FF D8 FF
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

    // WebP: "RIFF" .... "WEBP"
    const isWebp =
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50;

    return isPng || isJpeg || isWebp;
  } catch {
    return false;
  }
}

export async function validateMediaUpload(
  file: File,
  purpose: 'avatar' | 'spec-diagram'
): Promise<MediaValidationResult> {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
    return {
      valid: false,
      error: 'Unsupported file format. Only JPEG, PNG, and WebP images are permitted.',
    };
  }

  const maxBytes = purpose === 'avatar' ? MAX_AVATAR_SIZE_BYTES : MAX_SPEC_IMAGE_SIZE_BYTES;
  if (file.size <= 0 || file.size > maxBytes) {
    return {
      valid: false,
      error: `File size exceeds maximum limit of ${Math.round(maxBytes / (1024 * 1024))}MB.`,
    };
  }

  const magicValid = await verifyImageMagicBytes(file);
  if (!magicValid) {
    return {
      valid: false,
      error: 'File header signature does not match a valid JPEG, PNG, or WebP image.',
    };
  }

  return {
    valid: true,
    sanitizedFileName: `${Date.now()}-${sanitizeStorageFileName(file.name)}`,
  };
}

export function buildUserAvatarStoragePath(uid: string, sanitizedFileName: string): string {
  return `users/${uid}/avatar/${sanitizedFileName}`;
}

export function buildIdeaDiagramStoragePath(
  uid: string,
  ideaId: string,
  sanitizedFileName: string
): string {
  return `ideas/${ideaId}/attachments/${uid}/${sanitizedFileName}`;
}
