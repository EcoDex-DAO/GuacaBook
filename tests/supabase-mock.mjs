export const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
export const rows = new Map(),
  objects = new Map();
export const counters = { uploads: 0 };
export const faults = { writes: 0, delay: 0 };
export function resetMock() {
  rows.clear();
  objects.clear();
  counters.uploads = 0;
  faults.writes = 0;
  faults.delay = 0;
}
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
export async function setup(page) {
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
      process.env.TEST_BASE_URL || "http://localhost:3000",
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
      if (faults.writes > 0) {
        faults.writes--;
        return json({ message: "Temporary failure" }, 503);
      }
      if (faults.delay)
        await new Promise((resolve) => setTimeout(resolve, faults.delay));
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
        counters.uploads++;
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
