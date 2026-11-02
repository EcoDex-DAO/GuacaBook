import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1100 },
  });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:3000");
  await page.getByLabel("Nom ou pseudonyme").fill("Test contributeur");
  await page.getByText("Enregistrer un ara", { exact: true }).click();
  await page.getByLabel("Nom (facultatif)", { exact: true }).fill("Kiwi");
  await page
    .getByLabel("Espèce (laisser vide si inconnue)")
    .fill("Ara ararauna");
  await page.getByRole("button", { name: "Créer un ara", exact: true }).click();
  await page.getByLabel("Séance de prise de vue").fill("matin-1");
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 480;
    const x = c.getContext("2d");
    x.fillStyle = "#386f58";
    x.fillRect(0, 0, 640, 480);
    x.fillStyle = "#f8d36b";
    x.fillRect(200, 130, 160, 160);
    return c.toDataURL().split(",")[1];
  });
  await page
    .locator("input[type=file]")
    .setInputFiles([
      {
        name: "test.png",
        mimeType: "image/png",
        buffer: Buffer.from(png, "base64"),
      },
    ]);
  const canvas = page.locator("svg.canvas");
  await canvas.waitFor();
  await page.getByLabel("Côté anatomique").selectOption("left");
  const bounds = await canvas.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width * 0.2,
    bounds.y + bounds.height * 0.2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * 0.6,
    bounds.y + bounds.height * 0.7,
  );
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Supprimer l’annotation 1", exact: true })
    .waitFor();
  await page
    .getByRole("status")
    .filter({ hasText: "Brouillon enregistré" })
    .waitFor();
  await page.reload();
  await canvas.waitFor();
  assert.equal(await page.locator("svg.canvas rect").count(), 1);
  assert.equal(
    await page.getByLabel("Nom ou pseudonyme").inputValue(),
    "Test contributeur",
  );
  await page.locator("input[type=checkbox]").check();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter le dataset" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  const zip = await JSZip.loadAsync(await readFile(path));
  const json = JSON.parse(await zip.file("annotations.json").async("string"));
  assert.equal(json.annotations.length, 1);
  assert.equal(json.images[0].width, 640);
  assert.equal(json.annotations[0].guacabook.side, "left");
  assert.equal(json.guacabook.individuals[0].name, "Kiwi");
  assert.equal(json.images[0].guacabook.session_id, "matin-1");
  assert.ok(zip.file(json.images[0].file_name));
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  console.log(
    "PASS: ara → import PNG → annotation gauche → sauvegarde/rechargement → ZIP COCO + original ; affichage mobile sans débordement.",
  );
} finally {
  await browser.close();
}
