export type Bird = { id: string; name: string; species: string };
export type Box = {
  id: string;
  category: "macaw" | "periocular_region";
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
  quality: "unreviewed" | "usable" | "blurry";
};
export type Dataset = {
  profile: string;
  consent: boolean;
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
      description: "GuacaBook — annotations locales",
      version: "1.0",
      extensions: "GuacaBook v1; voir README.md",
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
      },
    })),
    annotations: data.photos
      .flatMap((p, i) =>
        p.boxes.map((b) => ({
          id: b.id,
          image_id: i + 1,
          category_id: b.category === "macaw" ? 1 : 2,
          bbox: b.bbox,
          area: b.bbox[2] * b.bbox[3],
          iscrowd: 0,
          guacabook: {
            individual_id: b.birdId || null,
            side: b.category === "periocular_region" ? b.side : null,
          },
        })),
      )
      .map((a, i) => ({ ...a, id: i + 1 })),
    categories: [
      { id: 1, name: "macaw", supercategory: "animal" },
      { id: 2, name: "periocular_region", supercategory: "animal" },
    ],
    guacabook: {
      schema_version: 1,
      contributor: data.profile || null,
      individuals: data.birds,
      sessions: [
        ...new Set(data.photos.map((p) => p.sessionId).filter(Boolean)),
      ].map((id) => ({ id })),
      crops: [],
    },
  };
}
