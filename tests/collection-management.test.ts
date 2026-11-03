import { test } from "node:test";
import assert from "node:assert/strict";
import { Dataset, removeBird, coco } from "../lib/dataset";
import { researchDataset } from "../lib/researchExport";
const original = new Blob(["original"]);
const fixture = (): Dataset => ({
  profile: "Alice", consent: true,
  birds: [{ id: "a", name: "Kiwi", species: "" }, { id: "b", name: "Rio", species: "" }],
  batchStages: { batch: 5, other: 4 },
  photos: [{ id: "photo", name: "ara.png", blob: original, width: 100, height: 80,
    capturedAt: "", sessionId: "morning", batchId: "batch", birdId: "a", quality: "usable",
    completed: true, doneSteps: [0,1,2,3,4,5], viewpoint: null, bodyVisibility: "not_visible", eyeVisible: "no",
    boxes: [{ id: "box", category: "macaw", birdId: "a", side: "unknown", bbox: [0,0,50,50] },
      { id: "other-box", category: "macaw", birdId: "b", side: "unknown", bbox: [50,0,50,50] }],
  }],
});
test("delete animal keeps originals and other identities, removes dangling references and resets affected workflow", () => {
  const before = fixture();
  const out = removeBird(before, "a");
  assert.deepEqual(out.birds.map(b => b.id), ["b"]);
  assert.equal(out.photos[0].blob, original);
  assert.equal(out.photos[0].birdId, undefined);
  assert.deepEqual(out.photos[0].boxes.map(b => b.birdId), ["b"]);
  assert.equal(out.photos[0].completed, false);
  assert.deepEqual(out.batchStages, { other: 4 });
  assert.equal(before.birds.length, 2);
  assert.equal(before.photos[0].boxes.length, 2);
});
test("global final export isolates identifiers across owners and omits incomplete photos", () => {
  const a = fixture(), b = fixture();
  b.photos.push({ ...b.photos[0], id: "unfinished", completed: false });
  b.photos.push({ ...b.photos[0], id: "invalid", eyeVisible: "yes", boxes: [] });
  const out = researchDataset([{ ownerId: "owner1", dataset: a }, { ownerId: "owner2", dataset: b }]);
  assert.equal(out.photos.length, 2);
  assert.equal(new Set(out.photos.map(p => p.id)).size, 2);
  assert.notEqual(out.photos[0].sessionId, out.photos[1].sessionId);
  const json = coco(out);
  assert.equal(new Set(json.images.map(p => p.file_name)).size, 2);
  for (const box of json.annotations) assert.ok(json.guacabook.individuals.some(b => b.id === box.guacabook.individual_id));
  assert.throws(() => researchDataset([{ ownerId: "private", dataset: { ...a, consent: false } }]), /Autorisation/);
});
