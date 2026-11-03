import { Dataset, stepValid } from "./dataset";

// Namespace every identifier: collections may reuse session names or imported IDs.
export function researchDataset(
  collections: { ownerId: string; dataset: Dataset }[],
): Dataset {
  const merged: Dataset = {
    profile: "GuacaBook",
    consent: true,
    birds: [],
    photos: [],
  };
  for (const { ownerId, dataset } of collections) {
    if (!dataset.consent) throw new Error("Autorisation requise avant export.");
    const id = (value: string) => `${ownerId}__${value}`;
    merged.birds.push(...dataset.birds.map(b => ({ ...b, id: id(b.id) })));
    merged.photos.push(
      ...dataset.photos
        .filter(p => p.completed && stepValid(p, 5))
        .map(p => ({
          ...p,
          id: id(p.id),
          birdId: p.birdId ? id(p.birdId) : undefined,
          sessionId: p.sessionId ? id(p.sessionId) : "",
          batchId: p.batchId ? id(p.batchId) : undefined,
          boxes: p.boxes.map(b => ({
            ...b,
            id: id(b.id),
            birdId: b.birdId ? id(b.birdId) : "",
          })),
        })),
    );
  }
  return merged;
}
