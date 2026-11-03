// UI integration against a simulated Supabase HTTP API. RLS is tested separately in PostgreSQL.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
import {
  A,
  B,
  rows,
  setup,
  signIn,
  counters,
  faults,
} from "./supabase-mock.mjs";
async function open() {
  const page = await browser.newPage({
    locale: "fr-FR",
    viewport: { width: 1440, height: 1100 },
  });
  page.setDefaultTimeout(20000);
  page.on("dialog", (dialog) => dialog.accept());
  const png = await setup(page);
  await page.goto(process.env.TEST_BASE_URL || "http://localhost:3000");
  return { page, png };
}
async function login(page, email) {
  await signIn(page, email);
  await page.locator(".beta-notice").waitFor();
  assert.equal(
    await page.locator(".beta-notice").innerText(),
    "Bêta : 100 photos maximum par compte, 15 Mo par photo, JPEG / PNG / WebP.",
  );
  assert.equal(await page.getByRole("heading", { name: "Votre collection centralisée" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Actualiser depuis le projet" }).count(), 0);
}
async function save(page) {
  await page
    .getByRole("status")
    .filter({ hasText: "Toutes les modifications sont enregistrées en ligne." })
    .first()
    .waitFor();
}
try {
  const { page, png } = await open();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "a@example.com");
  await page.getByLabel("Nom ou pseudonyme").fill("Contributeur A");
  await page.getByRole("button", { name: "Entrer dans GuacaBook →" }).click();
  await page.getByLabel("Nom (facultatif)", { exact: true }).fill("Kiwi A");
  await page.getByRole("button", { name: "Créer un ara", exact: true }).click();
  await page.getByLabel("Photos du lot").setInputFiles({
    name: "test.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await save(page);
  assert.equal(rows.get(A).dataset.photos.length, 1);
  assert.equal("blob" in rows.get(A).dataset.photos[0], false);
  assert.ok(rows.get(A).dataset.photos[0].objectPath.startsWith(A + "/"));
  await page.locator("input[type=checkbox]").check();
  await save(page);
  await page
    .getByRole("button", { name: "Soumettre ma collection à la recherche" })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Collection soumise avec votre autorisation" })
    .waitFor();
  assert.equal(rows.get(A).status, "submitted");
  assert.equal(counters.uploads, 1);
  await page
    .getByText("Administration des contributions", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Actualiser les contributions", exact: true })
    .click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exporter la contribution COCO", exact: true })
    .click();
  assert.match((await downloaded).suggestedFilename(), /^guacabook-/);
  // New device: remote data cannot be overwritten before loading it.
  const { page: other } = await open();
  await login(other, "a@example.com");
  await other.getByRole("heading", { name: "Kiwi A", exact: true }).waitFor();
  // First device saves a newer revision. The stale device must be rejected.
  await page
    .getByRole("button", { name: "← Mes animaux", exact: true })
    .click();
  await page.getByLabel("Nom (facultatif)", { exact: true }).fill("Nouvel ara");
  await page.getByRole("button", { name: "Créer un ara", exact: true }).click();
  await save(page);
  await other
    .getByLabel("Nom (facultatif)", { exact: true })
    .fill("Autre changement");
  await other
    .getByRole("button", { name: "Créer un ara", exact: true })
    .click();
  await other
    .getByRole("alert")
    .filter({ hasText: "Une autre version existe en ligne" })
    .waitFor();
  // A temporary failure pauses autosave; explicit retry preserves the edits.
  await page
    .getByRole("button", { name: "← Mes animaux", exact: true })
    .click();
  faults.writes = 1;
  await page.getByLabel("Nom (facultatif)", { exact: true }).fill("Retry bird");
  await page.getByRole("button", { name: "Créer un ara", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Sauvegarde impossible." })
    .waitFor();
  assert.equal(
    rows.get(A).dataset.birds.some((b) => b.name === "Retry bird"),
    false,
  );
  await page
    .getByRole("button", { name: "Réessayer la sauvegarde", exact: true })
    .click();
  await save(page);
  assert.ok(rows.get(A).dataset.birds.some((b) => b.name === "Retry bird"));
  // Edits made during a transfer must be drained by the same serialized queue.
  await page
    .getByRole("button", { name: "← Mes animaux", exact: true })
    .click();
  faults.delay = 900;
  const transferStarted = page.waitForRequest(
    (r) => r.method() === "PATCH" && r.url().includes("contributor_datasets"),
  );
  await page
    .getByLabel("Nom (facultatif)", { exact: true })
    .fill("During upload");
  await page.getByRole("button", { name: "Créer un ara", exact: true }).click();
  await transferStarted;
  await page
    .getByRole("button", { name: "Modifier mon profil", exact: true })
    .click();
  await page.getByLabel("Nom ou pseudonyme").fill("Newest profile");
  await page
    .getByRole("button", { name: "Entrer dans GuacaBook →", exact: true })
    .click();
  await save(page);
  faults.delay = 0;
  assert.equal(rows.get(A).dataset.profile, "Newest profile");
  // Signing out must flush a pending edit, rather than abandoning it.
  await page
    .getByRole("button", { name: "Modifier mon profil", exact: true })
    .click();
  await page.getByLabel("Nom ou pseudonyme").fill("Saved before signout");
  await page
    .getByRole("button", { name: "Entrer dans GuacaBook →", exact: true })
    .click();
  // Same browser, different login: only the account’s remote collection is loaded.
  await page
    .getByRole("button", { name: "Se déconnecter", exact: true })
    .click();
  await page.getByLabel("Adresse e-mail", { exact: true }).waitFor();
  assert.equal(rows.get(A).dataset.profile, "Saved before signout");
  await login(page, "b@example.com");
  await page.getByLabel("Nom ou pseudonyme").waitFor();
  assert.equal(
    await page.getByRole("heading", { name: "Kiwi A", exact: true }).count(),
    0,
  );
  await page.getByLabel("Nom ou pseudonyme").fill("Contributeur B");
  await page.getByRole("button", { name: "Entrer dans GuacaBook →" }).click();
  assert.equal(
    await page.getByRole("heading", { name: "Kiwi A", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: "Choisir cet animal →" }).count(),
    0,
  );
  await save(page);
  assert.equal(rows.get(B).dataset.photos.length, 0);
  assert.equal(rows.get(A).dataset.birds[0].name, "Kiwi A");
  assert.deepEqual(
    await page.evaluate(async () =>
      (await indexedDB.databases()).filter((db) => db.name === "keyval-store"),
    ),
    [],
  );
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  console.log(
    "PASS: sauvegarde automatique, chargement automatique, panne/reprise, modifications pendant transfert, déconnexion, conflit, comptes isolés et absence de brouillon persistant (API simulée).",
  );
} finally {
  await browser.close();
}
