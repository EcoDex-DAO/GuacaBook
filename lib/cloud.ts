import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dataset, Photo } from "./dataset";
export const BUCKET = "guacabook-photos";
export type StoredPhoto = Omit<Photo, "blob"> & {
  objectPath: string;
  mimeType: string;
};
export type StoredDataset = Omit<Dataset, "photos"> & { photos: StoredPhoto[] };
export type CloudRow = {
  owner_id: string;
  dataset: StoredDataset;
  revision: number;
  status: "draft" | "submitted";
  updated_at: string;
  consented_at: string | null;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function objectPath(userId: string, photoId: string) {
  if (!uuid.test(userId) || !uuid.test(photoId))
    throw new Error("Invalid photo identifier");
  return `${userId}/${photoId}`;
}
export function prepareCloudDataset(
  data: Dataset,
  userId: string,
): StoredDataset {
  if (data.photos.length > 100)
    throw new Error("Limite bêta : 100 photos par collection.");
  return {
    ...data,
    photos: data.photos.map(({ blob, ...photo }) => {
      if (blob.size > 15 * 1024 * 1024)
        throw new Error("Une photo dépasse 15 Mo.");
      if (!["image/jpeg", "image/png", "image/webp"].includes(blob.type))
        throw new Error(
          "La sauvegarde en ligne accepte JPEG, PNG et WebP. Convertissez les autres formats.",
        );
      return {
        ...photo,
        objectPath: objectPath(userId, photo.id),
        mimeType: blob.type,
      };
    }),
  };
}
export async function readCloudRow(
  client: SupabaseClient,
  ownerId: string,
): Promise<CloudRow | null> {
  const { data, error } = await client
    .from("contributor_datasets")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
export async function loadCloudDataset(
  client: SupabaseClient,
  row: CloudRow,
): Promise<Dataset> {
  if (!Array.isArray(row.dataset?.photos) || !Array.isArray(row.dataset?.birds))
    throw new Error("Format de sauvegarde invalide.");
  const photos: Photo[] = [];
  for (const p of row.dataset.photos) {
    if (p.objectPath !== objectPath(row.owner_id, p.id))
      throw new Error("Invalid photo path");
    const { data, error } = await client.storage
      .from(BUCKET)
      .download(p.objectPath);
    if (error || !data) throw error || new Error("Photo introuvable.");
    const { objectPath: _, mimeType, ...photo } = p;
    photos.push({
      ...photo,
      name:
        typeof photo.name === "string"
          ? photo.name.replace(/[^\p{L}\p{N}._-]/gu, "_")
          : "photo",
      blob:
        data.type === mimeType ? data : new Blob([data], { type: mimeType }),
    });
  }
  return { ...row.dataset, photos };
}
export async function saveCloudDataset(
  client: SupabaseClient,
  ownerId: string,
  data: Dataset,
  expectedRevision: number | null,
): Promise<CloudRow> {
  const stored = prepareCloudDataset(data, ownerId);
  const current = await readCloudRow(client, ownerId);
  if ((current?.revision ?? null) !== expectedRevision)
    throw new Error(
      "Une autre version existe en ligne. Rechargez-la avant de sauvegarder.",
    );
  const existing = new Set(
    current?.dataset.photos.map((p) => p.objectPath) ?? [],
  );
  for (let i = 0; i < data.photos.length; i++) {
    if (existing.has(stored.photos[i].objectPath)) continue;
    const { error } = await client.storage
      .from(BUCKET)
      .upload(stored.photos[i].objectPath, data.photos[i].blob, {
        upsert: false,
        contentType: stored.photos[i].mimeType,
      });
    // UUID paths are immutable. A retry can reuse a previously uploaded original.
    if (
      error &&
      !["409", "Duplicate"].includes(
        String((error as { statusCode?: string; error?: string }).statusCode),
      ) &&
      (error as { error?: string }).error !== "Duplicate"
    )
      throw error;
  }
  let query;
  if (expectedRevision === null)
    query = client
      .from("contributor_datasets")
      .insert({ owner_id: ownerId, dataset: stored, revision: 1 });
  else
    query = client
      .from("contributor_datasets")
      .update({ dataset: stored, revision: expectedRevision + 1 })
      .eq("owner_id", ownerId)
      .eq("revision", expectedRevision);
  const { data: row, error } = await query.select("*").maybeSingle();
  if (error?.code === "23505" || (!row && !error))
    throw new Error(
      "Une autre version existe en ligne. Rechargez-la avant de sauvegarder.",
    );
  if (error) throw error;
  return row as CloudRow;
}
