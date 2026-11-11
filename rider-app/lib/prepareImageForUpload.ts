import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image as RNImage, Platform } from 'react-native';

export type ImageCompressOptions = {
  maxEdge?: number;
  minEdge?: number;
  targetMaxBytes?: number;
  qualityStart?: number;
  qualityMin?: number;
};

/** Smaller files for Supabase Storage. QR stays sharper so it can still be scanned. */
export const imageUploadPresets = {
  avatar: { maxEdge: 512, minEdge: 256, targetMaxBytes: 80_000, qualityStart: 0.7, qualityMin: 0.42 },
  logo: { maxEdge: 640, minEdge: 320, targetMaxBytes: 100_000, qualityStart: 0.72, qualityMin: 0.45 },
  qr: { maxEdge: 720, minEdge: 480, targetMaxBytes: 130_000, qualityStart: 0.82, qualityMin: 0.62 },
  product: { maxEdge: 800, minEdge: 420, targetMaxBytes: 150_000, qualityStart: 0.72, qualityMin: 0.42 },
  proof: { maxEdge: 1200, minEdge: 640, targetMaxBytes: 180_000, qualityStart: 0.7, qualityMin: 0.42 },
} as const;

const FALLBACK = imageUploadPresets.product;

export type PreparedImage = {
  uri: string;
  contentType: 'image/jpeg';
};

function resolveOptions(options?: ImageCompressOptions) {
  return {
    maxEdge: options?.maxEdge ?? FALLBACK.maxEdge,
    minEdge: options?.minEdge ?? FALLBACK.minEdge,
    targetMaxBytes: options?.targetMaxBytes ?? FALLBACK.targetMaxBytes,
    qualityStart: options?.qualityStart ?? FALLBACK.qualityStart,
    qualityMin: options?.qualityMin ?? FALLBACK.qualityMin,
  };
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    RNImage.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err)
    );
  });
}

async function fileSizeBytes(uri: string): Promise<number> {
  if (Platform.OS === 'web' || uri.startsWith('blob:') || uri.startsWith('data:')) {
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      return blob.size;
    } catch {
      return 0;
    }
  }
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) return 0;
  return typeof info.size === 'number' ? info.size : 0;
}

async function resizeAction(uri: string, edge: number): Promise<ImageManipulator.Action> {
  try {
    const { width, height } = await getImageSize(uri);
    return width >= height ? { resize: { width: edge } } : { resize: { height: edge } };
  } catch {
    return { resize: { width: edge } };
  }
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image.'));
    img.src = src;
  });
}

async function canvasJpeg(uri: string, edge: number, quality: number): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const img = await loadHtmlImage(uri);
  const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), 'image/jpeg', quality);
  });
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

async function compressOnce(uri: string, edge: number, quality: number): Promise<string> {
  if (Platform.OS === 'web') {
    const webUri = await canvasJpeg(uri, edge, quality);
    if (webUri) return webUri;
  }
  const result = await ImageManipulator.manipulateAsync(uri, [await resizeAction(uri, edge)], {
    compress: quality,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}

/**
 * Resize and JPEG-compress before uploading to Supabase Storage.
 * Always returns a JPEG. Retries smaller until the file is under the target size.
 */
export async function prepareImageForUpload(localUri: string, options?: ImageCompressOptions): Promise<PreparedImage> {
  const { maxEdge, minEdge, targetMaxBytes, qualityStart, qualityMin } = resolveOptions(options);
  let edge = maxEdge;
  let quality = qualityStart;
  let lastUri = localUri;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const nextUri = await compressOnce(localUri, edge, quality);
    lastUri = nextUri;
    const bytes = await fileSizeBytes(nextUri);
    if (bytes > 0 && bytes <= targetMaxBytes) {
      return { uri: nextUri, contentType: 'image/jpeg' };
    }
    if (quality > qualityMin) {
      quality = Math.max(qualityMin, Math.round((quality - 0.08) * 100) / 100);
      continue;
    }
    if (edge > minEdge) {
      edge = Math.max(minEdge, Math.round(edge * 0.8));
      quality = qualityStart;
      continue;
    }
    break;
  }

  if (lastUri === localUri) {
    throw new Error('Could not compress image.');
  }
  return { uri: lastUri, contentType: 'image/jpeg' };
}
