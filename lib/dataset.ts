import type { SpeciesInfo } from "./macaws";
export type Bird = { id: string; name: string; species: string; speciesInfo?: SpeciesInfo; sex?: "male" | "female" | "unknown"; birthYear?: number | null };
export type Box = {
  id: string;
  category: "macaw" | "periocular_region" | "eye";
  birdId: string;
  side: "left" | "right" | "unknown";
  bbox: [number, number, number, number];
};
export type Photo = {
  id: string;
  name: string;
  blob: Blob;
  width: number;
  height: number;
  capturedAt: string;
  sessionId: string;
  boxes: Box[];
  birdId?: string;
  batchId?: string;
  workflowStep?: number;
  completed?: boolean;
  doneSteps?: number[];
  eyeLayout?: "left" | "right" | "both" | "unknown";
  regionBySide?: Partial<Record<Box["side"], "yes" | "no" | "unknown">>;
  viewpoint?: { azimuth: number; elevation: number } | null;
  bodyVisibility?: "full" | "partial" | "not_visible" | "unknown";
  eyeVisible?: "yes" | "no" | "unknown";
  regionVisible?: "yes" | "no" | "unknown";
  quality: "unreviewed" | "usable" | "blurry";
};
export type Dataset = {
  batchStages?: Record<string, number>;
  profile: string;
  consent: boolean;
  researchConsent?: { version: string; acceptedAt: string };
  deletedPhotoIds?: string[];
  birds: Bird[];
  photos: Photo[];
};
export const emptyDataset: Dataset = {
  profile: "",
  consent: false,
  birds: [],
  photos: [],
};
export function makeBox(
  start: { x: number; y: number },
  end: { x: number; y: number },
  width: number,
  height: number,
): [number, number, number, number] {
  const x1 = Math.max(0, Math.min(width, Math.min(start.x, end.x))),
    y1 = Math.max(0, Math.min(height, Math.min(start.y, end.y)));
  const x2 = Math.max(0, Math.min(width, Math.max(start.x, end.x))),
    y2 = Math.max(0, Math.min(height, Math.max(start.y, end.y)));
  return [x1, y1, x2 - x1, y2 - y1];
}
export function coco(data: Dataset) {
  if (!data.consent) throw new Error("Autorisation requise avant export.");
  return {
    info: {
      description: "GuacaBook — annotations",
      version: "2.0",
      extensions: "GuacaBook v2; see README.en.md and README.md",
    },
    licenses: [
      {
        id: 1,
        name: "CC BY 4.0",
        url: "https://creativecommons.org/licenses/by/4.0/",
      },
    ],
    images: data.photos.map((p, i) => ({
      id: i + 1,
      file_name: `images/${p.id}-${p.name}`,
      width: p.width,
      height: p.height,
      license: 1,
      date_captured: p.capturedAt || null,
      guacabook: {
        photo_id: p.id,
        session_id: p.sessionId || null,
        quality: p.quality,
        original_file_name: p.name,
        individual_id: p.birdId || null,
        batch_id: p.batchId || null,
        viewpoint: p.viewpoint ?? null,
        body_visibility: p.bodyVisibility ?? null,
        eye_visible: p.eyeVisible ?? null,
        eye_layout: p.eyeLayout ?? null,
        periocular_by_side: p.regionBySide ?? null,
        periocular_visible: p.regionVisible ?? null,
        annotation_status: p.completed ? "complete" : "draft",
      },
    })),
    annotations: data.photos
      .flatMap((p, i) =>
        p.boxes.map((b) => ({
          id: b.id,
          image_id: i + 1,
          category_id:
            b.category === "macaw" ? 1 : b.category === "eye" ? 3 : 2,
          bbox: b.bbox,
          area: b.bbox[2] * b.bbox[3],
          iscrowd: 0,
          guacabook: {
            individual_id: b.birdId || null,
            side: b.category !== "macaw" ? b.side : null,
          },
        })),
      )
      .map((a, i) => ({ ...a, id: i + 1 })),
    categories: [
      { id: 1, name: "macaw", supercategory: "animal" },
      { id: 2, name: "periocular_region", supercategory: "animal" },
      { id: 3, name: "eye", supercategory: "animal" },
    ],
    guacabook: {
      schema_version: 2,
      contributor: data.profile || null,
      individuals: data.birds,
      sessions: [
        ...new Set(data.photos.map((p) => p.sessionId).filter(Boolean)),
      ].map((id) => ({ id })),
      crops: [],
    },
  };
}

export function stepValid(p: Omit<Photo, "blob">, step: number): boolean {
  const has = (category: Box["category"]) =>
    p.boxes.some(
      (b) => b.category === category && b.birdId === (p.birdId || ""),
    );
  if (step === 0) return p.quality !== "unreviewed";
  if (step === 1) return p.viewpoint !== undefined;
  if (step === 2)
    return (
      !!p.bodyVisibility &&
      (!["full", "partial"].includes(p.bodyVisibility) || has("macaw"))
    );
  if (step === 3)
    return (
      !!p.eyeVisible &&
      (p.eyeVisible !== "yes" ||
        requiredSides(p).every((side) =>
          p.boxes.some(
            (b) =>
              b.category === "eye" &&
              b.birdId === (p.birdId || "") &&
              b.side === side,
          ),
        ))
    );
  if (step === 4)
    return (
      p.eyeVisible !== "yes" ||
      requiredSides(p).every((side) => {
        const visible =
          p.regionBySide?.[side] ??
          (p.eyeLayout === "both" ? undefined : p.regionVisible);
        return (
          !!visible &&
          (visible !== "yes" ||
            p.boxes.some(
              (b) =>
                b.category === "periocular_region" &&
                b.birdId === (p.birdId || "") &&
                b.side === side,
            ))
        );
      })
    );
  return [0, 1, 2, 3, 4].every((s) => stepValid(p, s));
}

export function requiredSides(p: Omit<Photo, "blob">): Box["side"][] {
  if (p.eyeLayout === "both") return ["left", "right"];
  if (p.eyeLayout) return [p.eyeLayout];
  // Legacy drafts preserve their declared laterality.
  const sides = p.boxes
    .filter((b) => b.category === "eye" && b.birdId === (p.birdId || ""))
    .map((b) => b.side);
  return sides.length ? [...new Set(sides)] : ["unknown"];
}
export function nextBatchTask(
  batch: Photo[],
  currentId: string,
  step: number,
): { id: string; step: number } | null {
  const done = (p: Photo, s: number) =>
    (p.doneSteps?.includes(s) || p.completed) && stepValid(p, s);
  const candidate = batch.find((p) => p.id !== currentId && !done(p, step));
  if (candidate) return { id: candidate.id, step };
  for (let s = step + 1; s <= 5; s++) {
    const p = batch.find((p) => !done(p, s));
    if (p) return { id: p.id, step: s };
  }
  return null;
}

// Delete images containing this animal, including all annotations in those images.
export function removeBird(data: Dataset, birdId: string): Dataset {
  const removed = data.photos.filter(p =>
    p.birdId === birdId || p.boxes.some(b => b.birdId === birdId),
  );
  const removedIds = new Set(removed.map(p => p.id));
  const retained = data.photos.filter(p => !removedIds.has(p.id));
  const removedBatches = new Set(removed.map(p => p.batchId || `${p.birdId || ""}:${p.sessionId}`));
  const retainedBatches = new Set(retained.map(p => p.batchId || `${p.birdId || ""}:${p.sessionId}`));
  return {
    ...data,
    birds: data.birds.filter(b => b.id !== birdId),
    photos: retained,
    deletedPhotoIds: [...new Set([...(data.deletedPhotoIds || []), ...removedIds])],
    batchStages: Object.fromEntries(Object.entries(data.batchStages || {}).filter(
      ([key]) => !removedBatches.has(key) || retainedBatches.has(key),
    )),
  };
}
