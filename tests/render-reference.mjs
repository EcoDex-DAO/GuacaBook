// Regenerate orientation cards from the actual procedural model (server required).
import { chromium } from "@playwright/test";
import { setup, signIn } from "./supabase-mock.mjs";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    locale: "fr-FR",
  });
  await setup(page);
  await page.goto(process.env.TEST_BASE_URL || "http://localhost:3000");
  await signIn(page);
  await page.getByLabel("Nom ou pseudonyme").fill("Référentiel");
  await page.getByRole("button", { name: "Entrer dans GuacaBook" }).click();
  await page.getByRole("button", { name: "Créer un ara", exact: true }).click();
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 100;
    c.height = 100;
    return c.toDataURL().split(",")[1];
  });
  await page.getByLabel("Photos du lot").setInputFiles({
    name: "reference.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page
    .getByRole("button", { name: "Nette / exploitable", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enregistrer et continuer →" })
    .click();
  for (const [label, a] of [
    ["Face", 0],
    ["Trois-quarts droit", 45],
    ["Profil droit", 90],
    ["Arrière droit", 135],
    ["Dos", 180],
    ["Arrière gauche", 225],
    ["Profil gauche", 270],
    ["Trois-quarts gauche", 315],
  ]) {
    const old = await page.locator(".reference canvas").elementHandle();
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.waitForFunction((el) => !el.isConnected, old);
    await page
      .locator(".reference canvas")
      .screenshot({ path: `public/reference/${a}.png` });
  }
} finally {
  await browser.close();
}
