import { useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import { ConfirmDialog } from './Modal.jsx';
import authService from '../services/authService.js';
import { useToast } from '../context/ToastContext.jsx';

const MAX_SOURCE_BYTES = 8 * 1024 * 1024; // what we will read before resizing
const OUTPUT_SIZE = 256; // the square we store

/**
 * The avatar itself is the upload control: click it, or the + badge, to
 * choose a picture. A small × appears on hover once a photo is set, so
 * clearing one is possible without a panel of buttons sitting on the page.
 *
 * The image is centre-cropped to a square and resized to 256px in the
 * browser before sending. A phone photo of 3-5MB becomes roughly 30KB,
 * which keeps the request small and every avatar the same shape.
 */
export default function AvatarUpload({ user, onChange, size = 92 }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  function toSquareJpeg(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('That file could not be read.'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('That file is not an image we can read.'));
        image.onload = () => {
          const side = Math.min(image.width, image.height);
          const sx = (image.width - side) / 2;
          const sy = (image.height - side) / 2;

          const canvas = document.createElement('canvas');
          canvas.width = OUTPUT_SIZE;
          canvas.height = OUTPUT_SIZE;

          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          // Transparent areas would render black as JPEG.
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
          ctx.drawImage(image, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-picking the same file after a failure
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return toast.error('Choose an image file — JPEG, PNG or WebP.');
    }
    if (file.size > MAX_SOURCE_BYTES) {
      return toast.error('That picture is very large. Choose one under 8MB.');
    }

    setBusy(true);
    try {
      const dataUrl = await toSquareJpeg(file);
      const updated = await authService.uploadAvatar(dataUrl);
      onChange?.(updated);
      toast.success('Profile picture updated.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const updated = await authService.removeAvatar();
      onChange?.(updated);
      setConfirmRemove(false);
      toast.success('Profile picture removed.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  const label = user?.avatar_url ? 'Change your profile picture' : 'Add a profile picture';

  return (
    <div className="avatar-pick" style={{ width: size, height: size }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFile}
        className="sr-only"
        id="avatar-file"
      />

      <button
        type="button"
        className="avatar-pick-btn"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title={label}
        aria-label={label}
      >
        <Avatar user={user} size={size} />
        <span className="avatar-plus" aria-hidden="true">+</span>
        {busy && <span className="avatar-busy" />}
      </button>

      {user?.avatar_url && !busy && (
        <button
          type="button"
          className="avatar-clear"
          onClick={() => setConfirmRemove(true)}
          title="Remove your profile picture"
          aria-label="Remove your profile picture"
        >
          ×
        </button>
      )}

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={remove}
        busy={busy}
        title="Remove your profile picture?"
        confirmLabel="Remove"
        message="Your initials will be shown instead. You can add another at any time."
      />
    </div>
  );
}
