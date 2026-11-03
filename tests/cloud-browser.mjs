// UI integration against a simulated Supabase HTTP API. RLS is tested separately in PostgreSQL.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
const rows = new Map(),
  objects = new Map();
let uploads = 0;
const jwt = (user) =>
  [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        role: "authenticated",
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "test-signature",
  ].join(".");
function actor(req) {
  const token = req.headers()["authorization"]?.split(" ")[1];
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub;
  } catch {
    return "";
  }
}
async function setup(page) {
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 300;
    c.getContext("2d").fillRect(0, 0, 400, 300);
    return c.toDataURL().split(",")[1];
  });
  await page.route("**/*", async (route) => {
    const origin = new URL(route.request().url()).origin;
    const appOrigin = new URL(
      process.env.TEST_BASE_URL || "http://localhost:3001",
    ).origin;
    if (origin !== appOrigin && origin !== "http://127.0.0.1:54321")
      return route.abort();
    return route.continue();
  });
  await page.route("http://127.0.0.1:54321/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      id = actor(req);
    const json = async (value, status = 200) =>
      route.fulfill({
        status,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
        },
        body: JSON.stringify(value),
      });
    if (req.method() === "OPTIONS") return json({});
    if (url.pathname.endsWith("/otp")) return json({});
    if (url.pathname.endsWith("/verify")) {
      const input = req.postDataJSON();
      if (input.token !== "123456") return json({ msg: "Invalid code" }, 403);
      const user = {
        id: input.email === "a@example.com" ? A : B,
        email: input.email,
        aud: "authenticated",
        role: "authenticated",
        created_at: new Date().toISOString(),
      };
      return json({
        user,
        access_token: jwt(user),
        refresh_token: "test-refresh",
        expires_in: 3600,
        token_type: "bearer",
      });
    }
    if (url.pathname.endsWith("/logout")) return json({});
    if (url.pathname.endsWith("/rpc/is_research_admin")) return json(id === A);
    if (url.pathname.endsWith("/rpc/submit_dataset")) {
      const input = req.postDataJSON(),
        row = rows.get(id);
      if (
        !row ||
        row.revision !== input.expected_revision ||
        !row.dataset.consent
      )
        return json({ message: "conflict" }, 400);
      row.revision++;
      row.status = "submitted";
      row.consented_at = new Date().toISOString();
      return json(row.revision);
    }
    if (url.pathname.includes("/rest/v1/contributor_datasets")) {
      const owner = url.searchParams.get("owner_id")?.replace("eq.", "") || id;
      if (req.method() === "GET")
        return json(
          url.searchParams.has("owner_id")
            ? rows.has(owner)
              ? [rows.get(owner)]
              : []
            : [...rows.values()],
        );
      const input = req.postDataJSON();
      if (req.method() === "POST") {
        if (rows.has(id))
          return json({ code: "23505", message: "duplicate" }, 409);
        const row = {
          ...input,
          status: "draft",
          updated_at: new Date().toISOString(),
          consented_at: null,
        };
        rows.set(id, row);
        return json(row);
      }
      const row = rows.get(id);
      if (
        !row ||
        row.revision !==
          Number(url.searchParams.get("revision")?.replace("eq.", ""))
      )
        return json(null);
      Object.assign(row, input, { status: "draft", consented_at: null });
      return json(row);
    }
    if (url.pathname.includes("/storage/v1/object/")) {
      const path = url.pathname.split("guacabook-photos/")[1];
      if (req.method() === "POST") {
        uploads++;
        if (objects.has(path))
          return json(
            {
              statusCode: "409",
              error: "Duplicate",
              message: "Already exists",
            },
            409,
          );
        objects.set(path, Buffer.from(png, "base64"));
        return json({ Key: path });
      }
      if (!objects.has(path)) return json({ message: "Missing" }, 404);
      return route.fulfill({
        contentType: "image/png",
        headers: { "access-control-allow-origin": "*" },
        body: objects.get(path),
      });
    }
    throw new Error(`Unhandled mock request: ${req.method()} ${url.pathname}`);
  });
  return png;
}
async function open() {
  const page = await browser.newPage({
    locale: "fr-FR",
    viewport: { width: 1440, height: 1100 },
  });
  page.setDefaultTimeout(20000);
  page.on("dialog", (dialog) => dialog.accept());
  const png = await setup(page);
  await page.goto(process.env.TEST_BASE_URL || "http://localhost:3001");
  return { page, png };
}
async function login(page, email) {
  await page.getByLabel("Adresse e-mail", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Recevoir un code", exact: true })
    .click();
  await page.getByLabel("Code reçu par e-mail").fill("123456");
  await page
    .getByRole("button", { name: "Valider le code", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Votre sauvegarde en ligne privée" })
    .waitFor();
}
async function save(page) {
  await page
    .getByRole("button", { name: "Sauvegarder en ligne", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Collection sauvegardée en ligne." })
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
  assert.equal(uploads, 1);
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
  assert.equal(
    await other
      .getByRole("button", { name: "Sauvegarder en ligne", exact: true })
      .isDisabled(),
    true,
  );
  await other
    .getByRole("button", { name: "Charger la version en ligne", exact: true })
    .click();
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
    .getByRole("button", { name: "Sauvegarder en ligne", exact: true })
    .click();
  await other
    .getByRole("alert")
    .filter({ hasText: "Une autre version existe en ligne" })
    .waitFor();
  // Same browser, different login: A's IndexedDB workspace must not leak to B.
  await page
    .getByRole("button", { name: "Se déconnecter", exact: true })
    .click();
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
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  console.log(
    "PASS: email OTP, upload privé, sauvegarde/rechargement, soumission, conflit de révision, isolation locale entre comptes et mobile (API simulée).",
  );
} finally {
  await browser.close();
}
