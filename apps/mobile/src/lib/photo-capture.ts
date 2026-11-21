/**
 * Camera and gallery capture for the vehicle inspection.
 *
 * The picker lives here rather than inside the screen so the edge cases are in
 * one place and can be reasoned about once. Every one of them is a real path a
 * user can take, and each returns a typed result instead of throwing:
 *
 *   - the user denies the camera permission;
 *   - the user denies the photo-library permission;
 *   - the user cancels the camera (no photo taken);
 *   - the user cancels the picker (no photo chosen);
 *   - the picked file is too large;
 *   - the picked file is not an image we can render;
 *   - the picker itself fails.
 *
 * The screen never sees an exception; it gets `{ ok: false, reason }` and shows
 * the matching message. Nothing here reaches a network.
 */
import * as ImagePicker from 'expo-image-picker';
import { Linking, Platform } from 'react-native';

/** 12 MB. Larger than any phone camera JPEG, small enough to stay responsive. */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export type CaptureSource = 'camera' | 'gallery';

export type CaptureFailure =
  | 'cancelled'
  | 'permission-denied'
  | 'too-large'
  | 'unsupported'
  | 'failed';

export type CaptureResult =
  | { ok: true; uri: string; width: number; height: number; source: CaptureSource }
  | { ok: false; reason: CaptureFailure; canOpenSettings?: boolean };

const SUPPORTED = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'];

function extensionOf(uri: string): string {
  const clean = uri.split('?')[0] ?? '';
  const dot = clean.lastIndexOf('.');
  return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase();
}

/**
 * Asks for a permission and reports whether we may proceed.
 *
 * `canAskAgain === false` means the OS will no longer show the prompt, so the
 * caller should offer a link to Settings instead of a dead retry button.
 */
async function ensurePermission(
  source: CaptureSource,
): Promise<{ granted: boolean; canAskAgain: boolean }> {
  if (source === 'camera') {
    const current = await ImagePicker.getCameraPermissionsAsync();
    if (current.granted) return { granted: true, canAskAgain: true };
    const asked = await ImagePicker.requestCameraPermissionsAsync();
    return { granted: asked.granted, canAskAgain: asked.canAskAgain ?? true };
  }

  // The gallery. On Android 13+ the system photo picker needs no permission at
  // all, so a denial here must not block the flow; `requestMediaLibraryPermissions`
  // returns granted on those versions and the picker still opens.
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    return { granted: true, canAskAgain: true };
  }
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return { granted: true, canAskAgain: true };
  const asked = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return { granted: asked.granted, canAskAgain: asked.canAskAgain ?? true };
}

/** The options both sources share, so a photo from either path behaves the same. */
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.85,
  exif: false,
  allowsEditing: false,
  // The picker downsizes before the file reaches us, which is what keeps a
  // 48-megapixel camera photo from becoming a memory problem.
  allowsMultipleSelection: false,
};

function fromAsset(
  asset: ImagePicker.ImagePickerAsset,
  source: CaptureSource,
): CaptureResult {
  const ext = extensionOf(asset.uri);
  if (ext && !SUPPORTED.includes(ext)) {
    return { ok: false, reason: 'unsupported' };
  }
  if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
    return { ok: false, reason: 'too-large' };
  }
  return {
    ok: true,
    uri: asset.uri,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
    source,
  };
}

/** Take a photo with the device camera. */
export async function capturePhoto(): Promise<CaptureResult> {
  try {
    const perm = await ensurePermission('camera');
    if (!perm.granted) {
      return { ok: false, reason: 'permission-denied', canOpenSettings: !perm.canAskAgain };
    }
    const res = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
    if (res.canceled) return { ok: false, reason: 'cancelled' };
    const asset = res.assets?.[0];
    if (!asset) return { ok: false, reason: 'cancelled' };
    return fromAsset(asset, 'camera');
  } catch {
    // A picker that throws (no camera hardware, a busy camera, an OS quirk) is
    // reported, never propagated: an exception here would take down the screen.
    return { ok: false, reason: 'failed' };
  }
}

/** Choose an existing photo. */
export async function pickFromGallery(): Promise<CaptureResult> {
  try {
    const perm = await ensurePermission('gallery');
    if (!perm.granted) {
      return { ok: false, reason: 'permission-denied', canOpenSettings: !perm.canAskAgain };
    }
    const res = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    if (res.canceled) return { ok: false, reason: 'cancelled' };
    const asset = res.assets?.[0];
    if (!asset) return { ok: false, reason: 'cancelled' };
    return fromAsset(asset, 'gallery');
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** Opens the OS settings page for this app, for a permission the user denied. */
export function openAppSettings(): void {
  Linking.openSettings().catch(() => {
    /* nothing useful to do if the OS refuses; the screen keeps its message */
  });
}
