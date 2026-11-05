import { test } from "node:test";
import assert from "node:assert/strict";
import { coco, makeBox, Dataset } from "../lib/dataset";
const data: Dataset = {
  profile: "Alice",
  consent: true,
  birds: [{ id: "bird-1", name: "Kiwi", species: "" }],
  photos: [
    {
      id: "photo-1",
      name: "ara.png",
      blob: new Blob(),
      width: 100,
      height: 80,
      capturedAt: "",
      sessionId: "session-1",
      quality: "unreviewed",
      boxes: [
        {
          id: "box-1",
          category: "periocular_region",
          birdId: "bird-1",
          side: "left",
          bbox: [10, 20, 30, 40],
        },
        {
          id: "box-2",
          category: "macaw",
          birdId: "",
          side: "unknown",
          bbox: [0, 0, 90, 80],
        },
      ],
    },
  ],
};
test("normalise un tracé inversé et limite les coordonnées aux pixels de la photo", () => {
  assert.deepEqual(
    makeBox({ x: 120, y: 90 }, { x: -5, y: 20 }, 100, 80),
    [0, 20, 100, 60],
  );
});
test("exporte les liens, catégories, inconnues et extensions sans inventer de date ou identité", () => {
  const out = coco(data);
  assert.equal(out.images[0].file_name, "images/photo-1-ara.png");
  assert.equal(out.images[0].date_captured, null);
  assert.equal(out.annotations.length, 2);
  assert.equal(out.annotations[0].area, 1200);
  assert.equal(out.annotations[0].guacabook.side, "left");
  assert.equal(out.annotations[0].guacabook.individual_id, "bird-1");
  assert.equal(out.annotations[1].guacabook.individual_id, null);
  assert.equal(out.annotations[1].category_id, 1);
  assert.deepEqual(out.guacabook.sessions, [{ id: "session-1" }]);
  assert.equal(out.guacabook.individuals[0].species, "");
});
test("refuse un export sans autorisation", () => {
  assert.throws(() => coco({ ...data, consent: false }), /Autorisation/);
});

test("le protocole impose les réponses et les boîtes, mais accepte les inconnues explicites", async () => {
  const { stepValid } = await import("../lib/dataset");
  const p: import("../lib/dataset").Photo = {
    ...data.photos[0],
    birdId: "bird-1",
    boxes: [],
    quality: "usable",
  };
  assert.equal(stepValid(p, 1), false);
  assert.equal(stepValid({ ...p, viewpoint: null }, 1), true);
  assert.equal(stepValid({ ...p, bodyVisibility: "partial" }, 2), false);
  assert.equal(stepValid({ ...p, bodyVisibility: "unknown" }, 2), true);
  assert.equal(stepValid({ ...p, eyeVisible: "yes" }, 3), false);
  assert.equal(stepValid({ ...p, eyeVisible: "no" }, 3), true);
  assert.equal(stepValid({ ...p, eyeVisible: "no" }, 4), true);
  assert.equal(
    stepValid({ ...p, eyeVisible: "yes", regionVisible: "yes" }, 4),
    false,
  );
  assert.equal(
    stepValid(
      { ...p, viewpoint: null, bodyVisibility: "unknown", eyeVisible: "no" },
      5,
    ),
    true,
  );
});
test("exporte les nouvelles catégories et le référentiel sans casser les IDs existants", () => {
  const p: import("../lib/dataset").Photo = {
    ...data.photos[0],
    birdId: "bird-1",
    batchId: "batch-1",
    viewpoint: { azimuth: 90, elevation: 30 },
    bodyVisibility: "partial",
    eyeVisible: "yes",
    regionVisible: "yes",
    completed: true,
    boxes: [
      ...data.photos[0].boxes,
      {
        id: "eye",
        category: "eye",
        side: "right",
        birdId: "bird-1",
        bbox: [1, 2, 3, 4],
      },
    ],
  };
  const out = coco({ ...data, photos: [p] });
  assert.equal(out.annotations[0].category_id, 2);
  assert.equal(out.annotations[2].category_id, 3);
  assert.equal(out.annotations[2].guacabook.side, "right");
  assert.deepEqual(out.images[0].guacabook.viewpoint, {
    azimuth: 90,
    elevation: 30,
  });
  assert.equal(out.images[0].guacabook.batch_id, "batch-1");
  assert.equal(out.images[0].guacabook.annotation_status, "complete");
});

test("mode face : exige un cadre par œil et une réponse périoculaire par côté", async () => {
  const { stepValid } = await import("../lib/dataset");
  const p: import("../lib/dataset").Photo = {
    ...data.photos[0],
    birdId: "bird-1",
    eyeVisible: "yes",
    eyeLayout: "both",
    boxes: [
      {
        id: "l",
        category: "eye",
        birdId: "bird-1",
        side: "left",
        bbox: [1, 1, 10, 10],
      },
    ],
  };
  assert.equal(stepValid(p, 3), false);
  p.boxes.push({
    id: "r",
    category: "eye",
    birdId: "bird-1",
    side: "right",
    bbox: [30, 1, 10, 10],
  });
  assert.equal(stepValid(p, 3), true);
  p.regionBySide = { left: "yes", right: "no" };
  assert.equal(stepValid(p, 4), false);
  p.boxes.push({
    id: "pl",
    category: "periocular_region",
    birdId: "bird-1",
    side: "left",
    bbox: [0, 0, 20, 20],
  });
  assert.equal(stepValid(p, 4), true);
});
test("traite la même étape sur tout le lot avant de passer à la suivante", async () => {
  const { nextBatchTask } = await import("../lib/dataset");
  const a = {
    ...data.photos[0],
    id: "a",
    quality: "usable" as const,
    doneSteps: [0],
  };
  const b = {
    ...data.photos[0],
    id: "b",
    quality: "unreviewed" as const,
    doneSteps: [],
  };
  assert.deepEqual(nextBatchTask([a, b], "a", 0), { id: "b", step: 0 });
  assert.deepEqual(
    nextBatchTask([a, { ...b, quality: "blurry", doneSteps: [0] }], "b", 0),
    { id: "a", step: 1 },
  );
  // Une tâche cochée mais devenue invalide est reproposée.
  assert.deepEqual(nextBatchTask([a, { ...b, doneSteps: [0] }], "a", 0), {
    id: "b",
    step: 0,
  });
});

test("skips periocular work only for a validated absence of eyes, including legacy cursors",async()=>{
  const {nextBatchTask,stepComplete}=await import("../lib/dataset");
  const noEye={...data.photos[0],id:"no-eye",eyeVisible:"no" as const,boxes:[],doneSteps:[3]};
  const visible={...noEye,id:"visible",eyeVisible:"yes" as const,eyeLayout:"left" as const};
  assert.equal(stepComplete(noEye,4),true);
  assert.equal(stepComplete({...noEye,doneSteps:[]},4),false);
  assert.equal(stepComplete({...noEye,eyeVisible:"unknown"},4),false);
  assert.equal(stepComplete(visible,4),false);
  assert.deepEqual(nextBatchTask([visible,noEye],"visible",4),{id:"visible",step:5});
  assert.deepEqual(nextBatchTask([noEye],noEye.id,3),{id:noEye.id,step:5});
  assert.deepEqual(nextBatchTask([noEye,visible],noEye.id,4),{id:visible.id,step:4});
  assert.deepEqual(nextBatchTask([{...noEye,eyeVisible:"unknown"}],noEye.id,3),{id:noEye.id,step:4});
});
