/**
 * Domain layer for media-related business logic.
 * Pure functions with no external dependencies.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type MediaType = 'image' | 'video' | 'audio' | 'document';

export type FileValidationResult =
  | { valid: true }
  | { valid: false; error: string };

// ─── MIME Type Detection ──────────────────────────────────────────────────────

const ALLOWED_PREFIXES = ['image/', 'video/', 'audio/'];
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const SAFE_MEDIA_MIMES = /^(image\/(jpeg|png|gif|webp|bmp|tiff|svg\+xml)|video\/|audio\/|application\/(pdf|octet-stream))/i;

/**
 * Determines the media type from a MIME type string.
 */
export function getMediaType(mimeType: string): MediaType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

/**
 * Checks if a MIME type is safe for display (prevents script execution).
 */
export function isSafeMimeType(mimeType: string): boolean {
  return SAFE_MEDIA_MIMES.test(mimeType);
}

/**
 * Validates a file for upload.
 * Returns a validation result with either success or an error message.
 */
export function validateFile(
  file: File,
  maxSizeBytes: number,
  fileTooLargeMessage: string,
  fileTypeNotAllowedMessage: string,
): FileValidationResult {
  // Size check
  if (file.size > maxSizeBytes) {
    return { valid: false, error: fileTooLargeMessage };
  }

  // Type check
  const isAllowed =
    ALLOWED_PREFIXES.some(p => file.type.startsWith(p)) ||
    ALLOWED_TYPES.includes(file.type);

  if (!isAllowed) {
    return { valid: false, error: fileTypeNotAllowedMessage };
  }

  return { valid: true };
}

/**
 * Checks file header for potential HTML/script content.
 * Returns true if suspicious content is detected.
 */
export async function hasSuspiciousHeader(file: File): Promise<boolean> {
  try {
    const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const headerText = new TextDecoder().decode(header);
    return headerText.startsWith('<') || headerText.startsWith('<!');
  } catch {
    return false;
  }
}

// ─── File Name Sanitization ───────────────────────────────────────────────────

/**
 * Sanitizes a filename for safe transmission.
 * Removes control characters, path separators, and trims whitespace.
 */
export function sanitizeFilename(filename: string, fallback = 'unnamed'): string {
  return (
    filename
      .replace(/[\x00-\x1f/\\:*?"<>|]/g, '_')
      .replace(/^\.+/, '_')
      .replace(/[.\s]+$/, '')
      .slice(0, 255) || fallback
  );
}

// ─── Base64 Utilities ─────────────────────────────────────────────────────────

/**
 * Reads a file as base64 string (data URL format, then extracts base64 part).
 */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Converts base64 string to a Blob URL.
 * More memory-efficient than data URIs for media.
 */
export function base64ToBlobUrl(base64: string, mimeType: string): string {
  // Strip whitespace (APIs often return MIME-formatted base64 with line breaks)
  const cleanBase64 = base64.replace(/\s/g, '');
  const byteChars = atob(cleanBase64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([byteArray], { type: mimeType });
  return URL.createObjectURL(blob);
}
