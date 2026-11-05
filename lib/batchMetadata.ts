import type { Dataset, Photo } from "./dataset";

export function rememberBatchMetadata(data: Dataset, photo: Photo): Dataset {
  if (!photo.batchId) return data;
  const existing=data.batchMetadataDefaults?.[photo.batchId];
  if(existing?.capturedAt===photo.capturedAt && existing.sessionId===photo.sessionId) return data;
  return {
    ...data,
    batchMetadataDefaults: {
      ...data.batchMetadataDefaults,
      [photo.batchId]: { capturedAt: photo.capturedAt, sessionId: photo.sessionId },
    },
  };
}

// Only fill missing fields in unfinished photos in this exact batch. Explicitly cleared
// fields and existing EXIF/manual values remain untouched. Quality is never copied.
export function inheritBatchMetadata(data: Dataset, photoId: string): Dataset {
  const photo = data.photos.find(p => p.id === photoId);
  if (!photo?.batchId || photo.completed) return data;
  const defaults = data.batchMetadataDefaults?.[photo.batchId];
  if (!defaults) return data;
  const patch: Partial<Photo> = {};
  const origin = { ...photo.metadataOrigin };
  if (!photo.capturedAt && origin.capturedAt !== "manual" && defaults.capturedAt) {
    patch.capturedAt = defaults.capturedAt;
    origin.capturedAt = "batch";
  }
  if (!photo.sessionId && origin.sessionId !== "manual" && defaults.sessionId) {
    patch.sessionId = defaults.sessionId;
    origin.sessionId = "batch";
  }
  if (!Object.keys(patch).length) return data;
  return { ...data, photos: data.photos.map(p => p.id === photoId ? { ...p, ...patch, metadataOrigin: origin } : p) };
}
