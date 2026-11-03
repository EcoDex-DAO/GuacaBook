// Run against a build made without NEXT_PUBLIC_SUPABASE_* settings.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({ locale: "fr-FR" });
  await page.goto(process.env.TEST_BASE_URL || "http://localhost:3000");
  await page
    .getByRole("alert")
    .filter({
      hasText: "La connexion au projet centralisé n’est pas configurée.",
    })
    .waitFor();
  assert.equal(await page.locator("input").count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "Créer un ara", exact: true })
      .count(),
    0,
  );
  assert.equal(await page.getByLabel("Nom ou pseudonyme").count(), 0);
  console.log(
    "PASS: sans configuration, aucun éditeur ni mode local n’est proposé.",
  );
} finally {
  await browser.close();
}
