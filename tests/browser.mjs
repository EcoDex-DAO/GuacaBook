import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { setup, signIn } from "./supabase-mock.mjs";
import { readFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    locale: "fr-FR",
  });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page);
  await page.goto(process.env.TEST_BASE_URL || "http://localhost:3000");
  await signIn(page);
  await page.getByLabel("Nom ou pseudonyme").fill("Test contributeur");
  await page.getByRole("button", { name: "Entrer dans GuacaBook" }).click();
  await page.getByRole("button", { name: "Identification À venir" }).click();
  await page
    .getByRole("heading", { name: "Identification", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Revenir au dataset" }).click();
  await page.getByLabel("Nom (facultatif)", { exact: true }).fill("Kiwi");
  await page.getByRole("button", { name: "Créer un ara", exact: true }).click();
  await page.getByLabel("Séance de prise de vue").fill("matin-1");
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 3000;
    const x = c.getContext("2d");
    x.fillStyle = "#386f58";
    x.fillRect(0, 0, c.width, c.height);
    return c.toDataURL().split(",")[1];
  });
  await page.getByLabel("Photos du lot").setInputFiles(
    ["a", "b"].map((n) => ({
      name: `${n}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    })),
  );
  const next = () =>
    page
      .getByRole("button", { name: "Enregistrer et continuer →", exact: true })
      .click();
  const selectPhoto = page.getByLabel("Choisir une photo du lot");
  async function assertPhoto(n) {
    assert.equal(
      await selectPhoto.inputValue(),
      await selectPhoto.locator("option").nth(n).getAttribute("value"),
    );
  }
  async function stage(n) {
    await page
      .locator(".steps button")
      .nth(n)
      .filter({ has: page.locator("span") })
      .waitFor();
    assert.equal(
      await page.locator(".steps button").nth(n).getAttribute("aria-current"),
      "step",
    );
  }
  async function box(cx = 600, cy = 1400, width = 200, height = 300) {
    const coords = await page.locator("svg.zoom-canvas").evaluate(
      (el, { cx, cy, width, height }) => {
        const m = el.getScreenCTM();
        const a = new DOMPoint(cx - width / 2, cy - height / 2).matrixTransform(
          m,
        );
        const b = new DOMPoint(cx + width / 2, cy + height / 2).matrixTransform(
          m,
        );
        return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } };
      },
      { cx, cy, width, height },
    );
    await page.mouse.move(coords.a.x, coords.a.y);
    await page.mouse.down();
    await page.mouse.move(coords.b.x, coords.b.y);
    await page.mouse.up();
  }
  // Toute la qualité, puis toute l’orientation.
  await page
    .getByRole("button", { name: "Nette / exploitable", exact: true })
    .click();
  await next();
  await stage(0);
  await assertPhoto(1);
  await page
    .getByRole("button", { name: "Floue / à refaire", exact: true })
    .click();
  await next();
  await stage(1);
  await assertPhoto(0);
  await page.getByRole("button", { name: "Face", exact: true }).click();
  assert.equal(await page.locator(".reference canvas").count(), 1);
  await page
    .locator(".reference")
    .screenshot({ path: "/tmp/guacabook-reference.png" });
  await next();
  await stage(1);
  await assertPhoto(1);
  await page
    .getByRole("status")
    .filter({ hasText: "Toutes les modifications sont enregistrées en ligne." })
    .first()
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Choisir cet animal →", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reprendre →", exact: true })
    .nth(1)
    .click();
  await stage(1);
  await assertPhoto(1);
  await page
    .getByRole("button", { name: "Point de vue inconnu", exact: true })
    .click();
  await next();
  await stage(2);
  await assertPhoto(0);
  // Corps : image haute cadrée, zoom/dézoom, cadres aux pixels source, reset.
  await page
    .getByRole("button", { name: "Oui, l’ara est entier", exact: true })
    .click();
  await page.getByRole("button", { name: "Zoomer", exact: true }).click();
  await page.getByRole("button", { name: "Zoomer", exact: true }).click();
  const beforePan = await page
    .locator("svg.zoom-canvas")
    .getAttribute("viewBox");
  await page
    .getByRole("button", { name: "Déplacer l’image", exact: true })
    .click();
  const pane = await page.locator("svg.zoom-canvas").boundingBox();
  await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
  await page.mouse.down();
  await page.mouse.move(pane.x + pane.width / 2 + 20, pane.y + pane.height / 2);
  await page.mouse.up();
  assert.notEqual(
    await page.locator("svg.zoom-canvas").getAttribute("viewBox"),
    beforePan,
  );
  await page
    .getByRole("button", { name: "Déplacer l’image", exact: true })
    .click();
  await box();
  assert.equal(await page.locator("svg.zoom-canvas rect").count(), 1);
  await page
    .getByRole("button", {
      name: "Réinitialiser les cadres de l’étape",
      exact: true,
    })
    .click();
  assert.equal(await page.locator("svg.zoom-canvas rect").count(), 0);
  await page.getByRole("button", { name: "Dézoomer", exact: true }).click();
  await page
    .getByRole("button", { name: "Ajuster à l’écran", exact: true })
    .click();
  await box();
  await next();
  await stage(2);
  await assertPhoto(1);
  await page
    .getByRole("button", { name: "Le corps n’est pas visible", exact: true })
    .click();
  await next();
  await stage(3);
  await assertPhoto(0);
  // Vue de face : gauche puis droite obligatoires, jamais une boîte pour les deux yeux.
  await page
    .getByRole("button", { name: "Oui, au moins un œil visible", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Deux yeux · face", exact: true })
    .click();
  await box(500, 1000, 100, 100);
  assert.equal(
    await page
      .getByRole("button", { name: "Enregistrer et continuer →", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("button", { name: /^Côté droit/ }).click();
  await box(700, 1000, 100, 100);
  await next();
  await stage(3);
  await assertPhoto(1);
  await page
    .getByRole("button", { name: "Non, aucun œil visible", exact: true })
    .click();
  await next();
  await stage(4);
  await assertPhoto(0);
  await page
    .getByRole("button", {
      name: "La région de ce côté est visible",
      exact: true,
    })
    .click();
  await box(500, 1000, 200, 200);
  await page.getByRole("button", { name: /^Côté droit/ }).click();
  await page
    .getByRole("button", {
      name: "La région de ce côté est visible",
      exact: true,
    })
    .click();
  await box(700, 1000, 200, 200);
  await page
    .getByRole("button", {
      name: "Réinitialiser ce côté uniquement",
      exact: true,
    })
    .click();
  assert.equal(await page.locator("svg.zoom-canvas rect").count(), 1);
  await box(700, 1000, 200, 200);
  // Mobile : le canevas reste cadré même pour une photo de 3000 px de haut.
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  const rect = await page.locator("svg.zoom-canvas").boundingBox();
  assert.ok(rect.height < 600);
  await page.screenshot({ path: "/tmp/guacabook-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await next();
  await stage(4);
  await assertPhoto(1);
  await next();
  await stage(5);
  await assertPhoto(0);
  await page
    .getByRole("button", { name: "Valider cette photo →", exact: true })
    .click();
  await stage(5);
  await assertPhoto(1);
  await page
    .getByRole("button", { name: "Valider cette photo →", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Collection · 2/2 photos validées",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("status")
    .filter({ hasText: "Toutes les modifications sont enregistrées en ligne." })
    .first()
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Choisir cet animal →", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Collection · 2/2 photos validées",
      exact: true,
    })
    .waitFor();
  const dp = page.waitForEvent("download");
  await page.getByText("Exporter mes données", { exact: true }).click();
  await page.getByRole("button", { name: "Exporter le dataset" }).click();
  const dl = await dp;
  const zip = await JSZip.loadAsync(await readFile(await dl.path()));
  const out = JSON.parse(await zip.file("annotations.json").async("string"));
  assert.equal(out.images.length, 2);
  assert.equal(out.annotations.length, 5);
  assert.deepEqual(
    out.annotations.map((a) => a.category_id),
    [1, 3, 3, 2, 2],
  );
  assert.deepEqual(
    out.annotations.map((a) => a.guacabook.side),
    [null, "left", "right", "left", "right"],
  );
  assert.equal(out.images[0].guacabook.eye_layout, "both");
  assert.deepEqual(
    out.annotations[0].bbox.map(Math.round),
    [500, 1250, 200, 300],
  );
  assert.ok(zip.file(out.images[0].file_name));
  assert.deepEqual(errors, []);
  console.log(
    "PASS: traitement par étape du lot, vue photo 3D, deux yeux, resets étape/côté, zoom/dézoom et coordonnées originales, photo haute sur mobile, sauvegarde et COCO.",
  );
} finally {
  await browser.close();
}
