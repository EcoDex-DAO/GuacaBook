import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { A, B, rows, objects, setup, signIn } from "./supabase-mock.mjs";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ locale: "fr-FR" });
  const png = await setup(page);
  const photoId = "33333333-3333-4333-8333-333333333333";
  for (const owner of [A, B]) {
    const photo = { id: photoId, name: "ara.png", objectPath: `${owner}/${photoId}`, mimeType: "image/png", width: 100, height: 80, capturedAt: "", sessionId: "session", birdId: "bird", quality: "usable", completed: true, viewpoint: null, bodyVisibility: "not_visible", eyeVisible: "no", boxes: [] };
    rows.set(owner, { owner_id: owner, revision: 1, status: owner === A ? "submitted" : "draft", consented_at: owner === A ? new Date().toISOString() : null,
      dataset: { profile: owner === A ? "Admin" : "Private", consent: owner === A, birds: [{ id: "bird", name: "Kiwi", species: "" }], photos: [photo] } });
    objects.set(photo.objectPath, Buffer.from(png, "base64"));
  }
  await page.goto(process.env.TEST_BASE_URL || "http://localhost:3000");
  await signIn(page);
  await page.getByRole("heading", { name: "Kiwi", exact: true }).waitFor();
  await page.getByText("Administration des contributions", { exact: true }).click();
  async function archive(button) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: button, exact: true }).click();
    const download = await pending;
    return JSZip.loadAsync(await readFile(await download.path()));
  }
  const raw = await archive("Exporter tous les originaux pour vérification");
  assert.equal(Object.values(raw.files).filter(f => !f.dir && f.name.startsWith("images/")).length, 2);
  const final = await archive("Exporter le dataset annoté final (COCO)");
  const coco = JSON.parse(await final.file("annotations.json").async("string"));
  assert.equal(coco.images.length, 1);
  assert.ok(final.file(coco.images[0].file_name));
  assert.ok(coco.images[0].file_name.includes(A));
  assert.equal(JSON.parse(await final.file("manifest.json").async("string")).collections.length, 1);
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Supprimer cet animal", exact: true }).click();
  assert.equal(rows.get(A).dataset.birds.length, 1);
  await page.getByRole("heading", { name: "Kiwi", exact: true }).waitFor();
  page.once("dialog", dialog => { assert.match(dialog.message(), /photos seront conservées/); return dialog.accept(); });
  await page.getByRole("button", { name: "Supprimer cet animal", exact: true }).click();
  await page.waitForFunction(() => !document.body.textContent.includes("Modifications en attente d’enregistrement…") && document.body.textContent.includes("Toutes les modifications sont enregistrées en ligne."));
  assert.equal(rows.get(A).dataset.birds.length, 0);
  assert.equal(rows.get(A).dataset.photos.length, 1);
  assert.equal(rows.get(A).dataset.photos[0].birdId, undefined);
  assert.ok(objects.has(`${A}/${photoId}`));
  await page.reload();
  await page.getByText("Photos sans animal associé", { exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Kiwi", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Se déconnecter", exact: true }).click();
  await signIn(page, "b@example.com");
  await page.getByRole("heading", { name: "Kiwi", exact: true }).waitFor();
  assert.equal(await page.getByText("Administration des contributions", { exact: true }).count(), 0);
  console.log("PASS: confirmation/cancel, persisted deletion preserving originals, global review/final ZIP contents, contributor UI isolation (simulated API).");
} finally { await browser.close(); }
