import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.TEST_BASE_URL || "http://localhost:3000");
  await page.getByLabel("Nom ou pseudonyme").fill("Test contributeur");
  await page.getByRole("button", { name: "Entrer dans GuacaBook" }).click();
  await page.getByRole("button", { name: "Identification À venir" }).click();
  await page
    .getByRole("heading", { name: "Identification", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Revenir au dataset" }).click();
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
    .getByLabel("Photos du lot")
    .setInputFiles(
      ["a", "b"].map((n) => ({
        name: `${n}.png`,
        mimeType: "image/png",
        buffer: Buffer.from(png, "base64"),
      })),
    );
  const next = () =>
    page.getByRole("button", { name: "Continuer →", exact: true }).click();
  const svg = page.locator("svg.canvas");
  async function box() {
    const b = await svg.boundingBox();
    await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.7);
    await page.mouse.up();
  }
  assert.equal(
    await page
      .getByRole("button", { name: "Continuer →", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Nette / exploitable", exact: true })
    .click();
  await next();
  await page.getByRole("button", { name: "Profil droit", exact: true }).click();
  await page.getByLabel("Hauteur de prise de vue").selectOption("30");
  assert.equal(await page.locator(".reference canvas").count(), 1);
  await page.locator(".reference").screenshot({path:"/tmp/guacabook-reference.png"});
  await next();
  await page
    .getByRole("button", {
      name: "Non, une partie est hors cadre",
      exact: true,
    })
    .click();
  await box();
  await next();
  await page
    .getByRole("button", { name: "Oui, je vois un œil", exact: true })
    .click();
  await page
    .getByLabel("Côté anatomique de la nouvelle zone")
    .selectOption("right");
  await box();
  await next();
  await page
    .getByRole("button", { name: "La région est visible", exact: true })
    .click();
  await page
    .getByLabel("Côté anatomique de la nouvelle zone")
    .selectOption("right");
  await box();
  await next();
  await page
    .getByRole("button", { name: "Valider cette photo →", exact: true })
    .click();
  // La deuxième photo recommence à la qualité, sans réutiliser les réponses.
  await page
    .getByRole("heading", {
      name: "La photo est-elle exploitable ?",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Floue / à refaire", exact: true })
    .click();
  await next();
  await page
    .getByRole("button", { name: "Point de vue inconnu", exact: true })
    .click();
  await next();
  await page
    .getByRole("button", { name: "Le corps n’est pas visible", exact: true })
    .click();
  await next();
  await page
    .getByRole("button", { name: "Non, aucun œil visible", exact: true })
    .click();
  await next();
  await page
    .getByRole("heading", { name: "Vérifiez cette photo", exact: true })
    .waitFor();
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
    .filter({ hasText: "Brouillon enregistré" })
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
  await page.locator("input[type=checkbox]").check();
  const dp = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter le dataset" }).click();
  const dl = await dp;
  const zip = await JSZip.loadAsync(await readFile(await dl.path()));
  const out = JSON.parse(await zip.file("annotations.json").async("string"));
  assert.equal(out.images.length, 2);
  assert.equal(out.annotations.length, 3);
  assert.deepEqual(
    out.annotations.map((a) => a.category_id),
    [1, 3, 2],
  );
  assert.deepEqual(out.images[0].guacabook.viewpoint, {
    azimuth: 90,
    elevation: 30,
  });
  assert.equal(out.images[0].guacabook.body_visibility, "partial");
  assert.equal(out.images[1].guacabook.eye_visible, "no");
  assert.equal(out.images[1].guacabook.viewpoint, null);
  assert.equal(out.annotations[1].guacabook.side, "right");
  assert.ok(zip.file(out.images[0].file_name));
  assert.equal(out.guacabook.contributor, "Test contributeur");
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.getByRole("button", { name: "Reprendre →" }).first().click();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.screenshot({ path: "/tmp/guacabook-mobile.png", fullPage: true });
  console.log(
    "PASS: profil, onglets, animal, lot de deux photos, 3D, étapes guidées, absence d’œil, persistance, export COCO et mobile.",
  );
} finally {
  await browser.close();
}
