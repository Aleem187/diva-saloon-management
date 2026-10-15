/*
 * Rules for files attached to consent records and staff documents.
 *
 * Deliberately NOT in `@/lib/validation`: that module imports Zod, and the consent
 * form (a client component) needs only these constants. Importing them from there
 * shipped the whole of Zod (about 96 KB gzipped) to the browser for one number.
 * Keep this file free of imports so it stays that small.
 */

/** What the bucket accepts, kept in step with the migration's check constraint. */
export const ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MAX_FILES = 5;

export const ATTACHMENT_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Checks one uploaded file. Returns a message to show, or null if it is fine.
 * Re-checked here as well as by the bucket, because a browser is free to say
 * whatever it likes about a file's type.
 */
export function describeAttachmentProblem(file: File): string | null {
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return `${file.name} is larger than ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB.`;
  }
  if (!(ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name} is a ${file.type || "unrecognised"} file. Attach a PDF, JPG, PNG or WebP.`;
  }
  return null;
}
