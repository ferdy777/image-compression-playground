import imageCompression from "browser-image-compression";
import workerLibUrl from "browser-image-compression/dist/browser-image-compression.js?url";
import { measureAsync, reportMetric, startLongTaskTracker } from "./perf";

export const MAX_SIZE_KB = 500;
export const MAX_DIMENSION_PX = 1920;

const KEEP_RESOLUTION = false;
const CONVERT_PNG_TO_WEBP = true;

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ProcessedImage {
  file: File;
  previewUrl: string;
  processingTimeMs: number;
  skipped: boolean;
  usedWebWorker: boolean;
  
  uiBlockedMs: number | null;
}

export interface CompressOptions {
  useWebWorker?: boolean;
  onProgress?: (progress: number) => void;
}

export async function getImageDimensions(file: File): Promise<ImageDimensions> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dimensions;
    } catch {
    }
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("The selected file could not be read as an image."));
    });

    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function shouldProcessImage(
  file: File,
  dimensions: ImageDimensions,
): boolean {
  const exceedsSizeLimit = file.size > MAX_SIZE_KB * 1024;
  const exceedsDimensionLimit =
    dimensions.width > MAX_DIMENSION_PX || dimensions.height > MAX_DIMENSION_PX;

  return exceedsSizeLimit || exceedsDimensionLimit;
}

export async function compressImage(
  file: File,
  knownDimensions?: ImageDimensions,
  { useWebWorker = true, onProgress }: CompressOptions = {},
): Promise<ProcessedImage> {
  const startedAt = performance.now();

  const originalDimensions = knownDimensions ?? (await getImageDimensions(file));

  const outputType =
    CONVERT_PNG_TO_WEBP && file.type === "image/png" ? "image/webp" : file.type;

  const tracker = startLongTaskTracker();

  let compressedBlob: Blob;
  let durationMs: number;

  try {
    const measured = await measureAsync("image-compress", () =>
      imageCompression(file, {
        maxSizeMB: MAX_SIZE_KB / 1024,
        maxWidthOrHeight: MAX_DIMENSION_PX,
        useWebWorker,
        libURL: new URL(workerLibUrl, document.baseURI).href,
        alwaysKeepResolution: KEEP_RESOLUTION,
        fileType: outputType,
        initialQuality: 0.8,
        preserveExif: false,
        onProgress,
      }),
    );
    compressedBlob = measured.result;
    durationMs = measured.durationMs;
  } catch (error) {
    tracker.stop();
    reportMetric("image_compress_error", {
      message: error instanceof Error ? error.message : String(error),
      originalKB: Math.round(file.size / 1024),
      inputType: file.type,
      useWebWorker,
    });
    throw error;
  }

  const longTasks = tracker.stop();

  reportMetric("image_compress", {
    durationMs: Math.round(durationMs),
    originalKB: Math.round(file.size / 1024),
    resultKB: Math.round(compressedBlob.size / 1024),
    originalWidth: originalDimensions.width,
    originalHeight: originalDimensions.height,
    inputType: file.type,
    outputType,
    useWebWorker,
    longTasksSupported: longTasks.supported,
    uiBlockedMs: longTasks.blockedMs,
    longestTaskMs: longTasks.longestTaskMs,
    savedPercent: Math.round((1 - compressedBlob.size / file.size) * 100),
    metSizeTarget: compressedBlob.size <= MAX_SIZE_KB * 1024,
    neededResize:
      originalDimensions.width > MAX_DIMENSION_PX || originalDimensions.height > MAX_DIMENSION_PX,
  });

  const typeChanged = outputType !== file.type;
  const outputName = typeChanged
    ? file.name.replace(/\.[^.]+$/, "") + ".webp"
    : file.name;

  const outputFile = new File([compressedBlob], outputName, {
    type: compressedBlob.type || outputType,
    lastModified: Date.now(),
  });

  const neededResize =
    originalDimensions.width > MAX_DIMENSION_PX ||
    originalDimensions.height > MAX_DIMENSION_PX;

  const finalFile =
    outputFile.size >= file.size && !neededResize && !typeChanged
      ? file
      : outputFile;

  return {
    file: finalFile,
    previewUrl: URL.createObjectURL(finalFile),
    processingTimeMs: performance.now() - startedAt,
    skipped: false,
    usedWebWorker: useWebWorker,
    uiBlockedMs: longTasks.supported ? longTasks.blockedMs : null,
  };
}
