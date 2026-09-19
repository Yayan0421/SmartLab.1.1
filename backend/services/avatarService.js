import { supabase } from '../config/database.js';
import ApiError from '../utils/ApiError.js';

const BUCKET = 'avatars';
const MAX_BYTES = 1_500_000; // decoded, before upload
const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * Turns a data URL from the browser into bytes, rejecting anything that is
 * not a small image. The client already resizes to a 256px square, so a
 * payload larger than this is either a mistake or an attempt to abuse the
 * endpoint.
 */
function decodeDataUrl(dataUrl) {
  const match = /^data:([\w/+.-]+);base64,(.+)$/.exec(String(dataUrl ?? ''));
  if (!match) throw ApiError.badRequest('That does not look like an image.');

  const [, mime, base64] = match;
  const extension = ALLOWED[mime];
  if (!extension) throw ApiError.badRequest('Use a JPEG, PNG or WebP image.');

  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length) throw ApiError.badRequest('That image appears to be empty.');
  if (bytes.length > MAX_BYTES) throw ApiError.badRequest('That image is too large. Use one under 1.5MB.');

  return { bytes, mime, extension };
}

/** The storage path for a user's picture, minus the extension. */
const pathFor = (userId, extension) => `${userId}/avatar-${Date.now()}.${extension}`;

/**
 * Uploads a new picture and returns its public URL.
 * Previous pictures for the user are deleted so the bucket does not grow
 * without bound each time someone changes their photo.
 */
export async function uploadAvatar(userId, dataUrl) {
  const { bytes, mime, extension } = decodeDataUrl(dataUrl);
  const path = pathFor(userId, extension);

  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: true,
    // Long cache with a timestamped filename: a new photo gets a new URL,
    // so browsers never show a stale one.
    cacheControl: '31536000',
  });

  if (error) {
    console.error('[avatar] upload failed:', error.message);
    throw ApiError.internal('The picture could not be uploaded. Please try again.');
  }

  await removeOldAvatars(userId, path);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Clears out everything in the user's folder except the file just written. */
async function removeOldAvatars(userId, keepPath) {
  try {
    const { data: files } = await supabase.storage.from(BUCKET).list(userId);
    const stale = (files ?? [])
      .map((file) => `${userId}/${file.name}`)
      .filter((path) => path !== keepPath);

    if (stale.length) await supabase.storage.from(BUCKET).remove(stale);
  } catch (error) {
    // Tidying is best-effort: a leftover file must not fail the upload.
    console.error('[avatar] could not remove old pictures:', error.message);
  }
}

/** Removes every picture a user has, for "remove photo". */
export async function deleteAvatar(userId) {
  try {
    const { data: files } = await supabase.storage.from(BUCKET).list(userId);
    const paths = (files ?? []).map((file) => `${userId}/${file.name}`);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  } catch (error) {
    console.error('[avatar] could not remove pictures:', error.message);
  }
}

export default { uploadAvatar, deleteAvatar };
