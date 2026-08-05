import { useCallback, useState } from 'react';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { ImagePayload } from '@control-plus/contracts';

import {
  isPhotoSendable,
  JPEG_QUALITY,
  PHOTO_MEDIA_TYPE,
  PHOTO_TOO_BIG_SENTENCE,
  resizedSize,
} from './photo.ts';

/** A photo that is ready to send, and a local uri so it can be looked at. */
export interface Photo {
  readonly uri: string;
  readonly data: string;
  readonly mediaType: string;
  readonly width: number;
  readonly height: number;
}

/** The photo in the shape the wire wants, or nothing when there is no photo. */
export function toImagePayload(photo: Photo | null | undefined): ImagePayload | undefined {
  return photo === null || photo === undefined
    ? undefined
    : {
        data: photo.data,
        mediaType: 'image/jpeg',
        width: photo.width,
        height: photo.height,
      };
}

export interface PhotoPicker {
  readonly photo: Photo | null;
  /** Something the person needs to read. Plain sentence, never a code. */
  readonly message: string | null;
  readonly busy: boolean;
  fromCamera: () => void;
  fromLibrary: () => void;
  clear: () => void;
}

/**
 * The sentences shown when the phone says no.
 *
 * Each one says what happened, that nothing is broken, and how to carry on. A
 * refused permission is not a failure state: the person can always type.
 */
const CAMERA_DENIED =
  'Control+ does not have permission to use the camera. You can turn it on in the Settings app, under Control+. You can also type your question, or choose a photo you have already taken.';

const LIBRARY_DENIED =
  'Control+ does not have permission to see your photos. You can turn it on in the Settings app, under Control+. You can also type your question, or take a new photo.';

const COULD_NOT_READ =
  'That photo could not be opened. Please try taking it again, or choose a different one.';

/**
 * Taking or choosing a photo, and getting it small enough to send (ADR-024).
 *
 * Everything native lives here: the two permission prompts, the two pickers and
 * the resize. The screen reads `photo` and `message` and knows about none of it.
 *
 * The resize happens before anything is sent, on the phone, because a large
 * uncropped screenshot over a slow connection is the case this audience is
 * actually in. The size check happens here too rather than only on the server:
 * the person should be told by the screen in front of them, not by a request
 * that fails.
 */
export function usePhoto(): PhotoPicker {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const accept = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    const target = resizedSize({ width: asset.width, height: asset.height });

    // The long edge is what the resize is expressed in, so a portrait photo and
    // a landscape one are both bounded by the same number.
    const context = ImageManipulator.manipulate(asset.uri).resize(
      asset.width >= asset.height
        ? { width: target.width }
        : { height: target.height },
    );
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({
      base64: true,
      compress: JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });

    const data = result.base64;
    if (data === undefined) {
      setMessage(COULD_NOT_READ);
      return;
    }

    if (!isPhotoSendable(data)) {
      // AC4, met before anything leaves the phone. The server holds the same
      // rule as a typed domain error, and base64 makes the request cap bite
      // first, so this is where a person actually meets the limit.
      setMessage(PHOTO_TOO_BIG_SENTENCE);
      return;
    }

    setMessage(null);
    setPhoto({
      uri: result.uri,
      data,
      mediaType: PHOTO_MEDIA_TYPE,
      width: result.width,
      height: result.height,
    });
  }, []);

  const run = useCallback(
    (
      granted: () => Promise<ImagePicker.PermissionResponse>,
      denied: string,
      launch: () => Promise<ImagePicker.ImagePickerResult>,
    ) => {
      void (async () => {
        setBusy(true);
        try {
          // Asked here, at the moment the person taps the thing that needs it,
          // rather than at launch. The sentence in the system dialog comes from
          // app.json and says what the photo is for.
          const permission = await granted();
          if (!permission.granted) {
            setMessage(denied);
            return;
          }

          const picked = await launch();
          if (picked.canceled) {
            return;
          }

          const asset = picked.assets[0];
          if (asset === undefined) {
            setMessage(COULD_NOT_READ);
            return;
          }

          await accept(asset);
        } catch {
          // Whatever went wrong in the native layer, the person reads one
          // sentence and still has two other ways to ask.
          setMessage(COULD_NOT_READ);
        } finally {
          setBusy(false);
        }
      })();
    },
    [accept],
  );

  const fromCamera = useCallback(() => {
    run(ImagePicker.requestCameraPermissionsAsync, CAMERA_DENIED, () =>
      // No in-picker editing: cropping on a small screen with unsteady hands is
      // a way to lose the part of the message that mattered.
      ImagePicker.launchCameraAsync({ quality: 1, exif: false }),
    );
  }, [run]);

  const fromLibrary = useCallback(() => {
    run(ImagePicker.requestMediaLibraryPermissionsAsync, LIBRARY_DENIED, () =>
      ImagePicker.launchImageLibraryAsync({
        quality: 1,
        exif: false,
        mediaTypes: ['images'],
      }),
    );
  }, [run]);

  const clear = useCallback(() => {
    setPhoto(null);
    setMessage(null);
  }, []);

  return { photo, message, busy, fromCamera, fromLibrary, clear };
}
