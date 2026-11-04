import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { setup, resetMock, signIn } from "./supabase-mock.mjs";
import { readFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const locales = [
  ["en-US", "en", "Name or nickname"],
  ["es-MX", "es", "Nombre o seudónimo"],
  ["pt-BR", "pt", "Nome ou apelido"],
  ["fr-CA", "fr", "Nom ou pseudonyme"],
];
const catalogs = Object.fromEntries(
  await Promise.all(
    ["en", "es", "pt"].map(async (code) => [
      code,
      JSON.parse(
        await readFile(
          new URL(`../lib/i18n/${code}.json`, import.meta.url),
          "utf8",
        ),
      ),
    ]),
  ),
);
try {
  for (const [browserLocale, code, nameLabel] of locales) {
    const page = await browser.newPage({
      locale: browserLocale,
      viewport: { width: 1440, height: 1100 },
    });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const t = (key) => (code === "fr" ? key : catalogs[code][key] || key);
    const button = (key) =>
      page.getByRole("button", { name: t(key), exact: true });
    const next = () => button("Enregistrer et continuer →").click();
    resetMock();
    await setup(page);
    await page.goto(process.env.TEST_BASE_URL || "http://localhost:3000");
    await signIn(page, "a@example.com", t);
    await page.getByLabel(nameLabel, { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Language / Langue").inputValue(), code);
    assert.equal(await page.locator("html").getAttribute("lang"), code);
    await page
      .getByLabel(nameLabel, { exact: true })
      .fill("Gauche {name} — João");
    await button("Entrer dans GuacaBook →").click();
    await page
      .getByLabel(t("Nom (facultatif)"), { exact: true })
      .fill("Kiwi droite");
    await page
      .getByLabel(t("Espèce"), { exact: true })
      .selectOption("Ara ararauna");
    await button("Créer un ara").click();
    await page.getByLabel(t("Séance de prise de vue")).fill("Jardín / manhã");
    await page.getByLabel(t("Photos du lot")).setInputFiles({
      name: "gauche.png",
      mimeType: "image/png",
      buffer: Buffer.from("not-an-image"),
    });
    await page
      .getByRole("alert")
      .filter({
        hasText:
          code === "fr"
            ? "Fichiers refusés"
            : code === "en"
              ? "Rejected files"
              : code === "es"
                ? "Archivos rechazados"
                : "Arquivos recusados",
      })
      .waitFor();
    const png = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = 480;
      c.getContext("2d").fillRect(0, 0, 640, 480);
      return c.toDataURL().split(",")[1];
    });
    await page.getByLabel(t("Photos du lot")).setInputFiles({
      name: "left gauche.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
    await button("Nette / exploitable").click();
    await next();
    await button("Face").click();
    await next();
    await button("Le corps n’est pas visible").click();
    await next();
    await button("Oui, au moins un œil visible").click();
    await button("Deux yeux · face").click();
    async function box(x) {
      const pts = await page.locator("svg.zoom-canvas").evaluate((el, x) => {
        const m = el.getScreenCTM();
        return [
          new DOMPoint(x, 100).matrixTransform(m),
          new DOMPoint(x + 50, 150).matrixTransform(m),
        ].map((p) => ({ x: p.x, y: p.y }));
      }, x);
      await page.mouse.move(pts[0].x, pts[0].y);
      await page.mouse.down();
      await page.mouse.move(pts[1].x, pts[1].y);
      await page.mouse.up();
    }
    await box(200);
    if (code === "en") {
      // A live switch changes instructions, not the step or its drawn boxes.
      for (const target of ["es", "pt", "fr", "en"]) {
        await page.getByLabel("Language / Langue").selectOption(target);
        const translated =
          target === "fr"
            ? "Voyez-vous un œil ?"
            : catalogs[target]["Voyez-vous un œil ?"];
        await page
          .getByRole("heading", { name: translated, exact: true })
          .waitFor();
        assert.equal(await page.locator("svg.zoom-canvas rect").count(), 1);
      }
    }
    await page
      .getByRole("button", { name: new RegExp("^" + t("Côté droit")) })
      .click();
    await box(400);
    await next();
    await button("La région de ce côté est visible").click();
    await box(200);
    await page
      .getByRole("button", { name: new RegExp("^" + t("Côté droit")) })
      .click();
    await button("La région de ce côté est masquée / coupée").click();
    await next();
    await button("Valider cette photo →").click();
    await page
      .getByRole("status")
      .filter({
        hasText: t("Toutes les modifications sont enregistrées en ligne."),
      })
      .first()
      .waitFor();
    const dp = page.waitForEvent("download");
    await page.getByText(t("Exporter mes données"), { exact: true }).click();
    await button("Exporter le dataset ↗").click();
    const dl = await dp;
    const zip = await JSZip.loadAsync(await readFile(await dl.path()));
    const out = JSON.parse(await zip.file("annotations.json").async("string"));
    assert.equal(out.guacabook.contributor, "Gauche {name} — João");
    assert.equal(out.guacabook.individuals[0].name, "Kiwi droite");
    assert.equal(out.guacabook.individuals[0].species, "Ara ararauna");
    assert.equal(out.images[0].guacabook.session_id, "Jardín / manhã");
    assert.deepEqual(
      out.annotations.map((a) => a.guacabook.side),
      ["left", "right", "left"],
    );
    assert.deepEqual(
      out.annotations.map((a) => a.category_id),
      [3, 3, 2],
    );
    assert.equal(out.categories[0].name, "macaw");
    assert.match(
      await zip.file("README.txt").async("string"),
      /private EXIF metadata/,
    );
    await page
      .getByLabel("Language / Langue")
      .selectOption(code === "fr" ? "en" : "fr");
    await page.reload();
    const saved = code === "fr" ? "en" : "fr";
    assert.equal(
      await page.getByLabel("Language / Langue").inputValue(),
      saved,
    );
    await page.getByLabel("Language / Langue").selectOption(code);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${code}: overflow`,
    );
    await page.screenshot({
      path: `/tmp/guacabook-${code}.png`,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      `PASS ${code}: browser locale, full annotation, consent/export, language switching, user data, persistence, mobile`,
    );
  }
  // Unsupported languages fall back to English; an explicit choice overrides the browser.
  const page = await browser.newPage({ locale: "de-DE" });
  await setup(page);
  await page.goto(process.env.TEST_BASE_URL || "http://localhost:3000");
  await page.getByLabel("Email address", { exact: true }).waitFor();
  await page.getByLabel("Language / Langue").selectOption("es");
  await page.reload();
  await page.getByLabel("Correo electrónico", { exact: true }).waitFor();
  await page.close();
  console.log("PASS: unsupported locale fallback and remembered override.");
} finally {
  await browser.close();
}
