export const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
export const rows = new Map(),
  objects = new Map();
export const counters = { uploads: 0 };
export const faults = { writes: 0, delay: 0, deletes: 0 };
export const annotationReviews = new Map();
export const managedUsers = new Map();
export const accountTypes = new Map();
const passwords = new Map();
function initializeAccounts() {
  managedUsers.clear();
  accountTypes.clear();
  passwords.clear();
  for (const type of [
    {
      id: "admin",
      label: "Administrateur",
      can_manage_accounts: true,
      can_review_data: true,
      builtin: true,
    },
    {
      id: "contributor",
      label: "Contributeur",
      can_manage_accounts: false,
      can_review_data: false,
      builtin: true,
    },
    {
      id: "reviewer",
      label: "Réviseur",
      can_manage_accounts: false,
      can_review_data: true,
      builtin: true,
    },
  ])
    accountTypes.set(type.id, type);
  for (const [id, email, type] of [
    [A, "ecodexdao@gmail.com", "admin"],
    [B, "b@example.com", "contributor"],
  ]) {
    managedUsers.set(id, {
      account_id: id,
      email,
      type_id: type,
      active: true,
      protected: id === A,
      created_at: new Date().toISOString(),
      email_confirmed_at: new Date().toISOString(),
      has_password: true,
    });
    passwords.set(id, "test-password-123");
  }
}
initializeAccounts();
export async function signIn(
  page,
  email = "a@example.com",
  t = (key) => key,
  password = "test-password-123",
  acceptResearch = true,
) {
  await page.getByLabel(t("Adresse e-mail"), { exact: true }).fill(email);
  await page.getByLabel(t("Mot de passe"), { exact: true }).fill(password);
  await page
    .getByRole("button", { name: t("Se connecter"), exact: true })
    .click();
  if (acceptResearch) {
    await page.locator(".research-consent, .beta-notice").first().waitFor();
    if (await page.locator(".research-consent").count()) {
      await page.locator('.research-consent input[type="checkbox"]').check();
      await page.getByRole("button", { name: t("Accepter et continuer"), exact: true }).click();
      await page.locator(".research-consent").waitFor({ state: "hidden" });
    }
  }
}
export function resetMock() {
  initializeAccounts();
  annotationReviews.clear();
  rows.clear();
  objects.clear();
  counters.uploads = 0;
  faults.writes = 0;
  faults.deletes = 0;
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
    if (url.pathname.endsWith("/token")) {
      const input = req.postDataJSON(),
        found = [...managedUsers.values()].find(
          (u) =>
            u.email === input.email ||
            (input.email === "a@example.com" && u.account_id === A),
        );
      if (!found || passwords.get(found.account_id) !== input.password)
        return json({ msg: "Invalid credentials" }, 400);
      const user = {
        id: found.account_id,
        email: found.email,
        aud: "authenticated",
        role: "authenticated",
        created_at: found.created_at,
      };
      return json({
        user,
        access_token: jwt(user),
        refresh_token: "test-refresh",
        expires_in: 3600,
        token_type: "bearer",
      });
    }
    if (url.pathname.endsWith("/recover")) return json({});
    if (url.pathname.endsWith("/user")) {
      const u = managedUsers.get(id);
      if (!u) return json({ msg: "Unknown user" }, 401);
      if (req.method() === "PUT") {
        const input = req.postDataJSON();
        passwords.set(id, input.password);
        u.has_password = true;
        u.email_confirmed_at = new Date().toISOString();
      }
      return json({
        id,
        email: u.email,
        aud: "authenticated",
        role: "authenticated",
        created_at: u.created_at,
      });
    }
    if (url.pathname.endsWith("/rpc/my_account")) {
      const u = managedUsers.get(id),
        type = accountTypes.get(u?.type_id);
      return json(
        u
          ? {
              user_id: id,
              type_id: u.type_id,
              label: type.label,
              active: u.active && !u.banned && !u.deletion_pending,
              banned: !!u.banned,
              deletion_pending: !!u.deletion_pending,
              protected: u.protected,
              has_password: u.has_password,
              can_manage_accounts: u.active && type.can_manage_accounts,
              can_review_data: u.active && type.can_review_data,
            }
          : null,
      );
    }
    if (url.pathname.endsWith("/rpc/can_manage_accounts"))
      return json(
        !!managedUsers.get(id)?.active &&
          !!accountTypes.get(managedUsers.get(id)?.type_id)
            ?.can_manage_accounts,
      );
    if (url.pathname.includes("/rpc/admin_")) {
      const current = managedUsers.get(id),
        type = accountTypes.get(current?.type_id);
      if (!current?.active || !type?.can_manage_accounts)
        return json({ message: "Forbidden" }, 403);
      const input = req.postDataJSON();
      if (url.pathname.endsWith("admin_list_accounts"))
        return json([...managedUsers.values()]);
      if (url.pathname.endsWith("admin_list_account_types"))
        return json([...accountTypes.values()]);
      if (url.pathname.endsWith("admin_set_account")) {
        const target = managedUsers.get(input.target_user);
        if (!target || target.protected)
          return json({ message: "Protected" }, 403);
        target.type_id = input.new_type;
        target.active = input.new_active;
        return json(null);
      }
      if (url.pathname.endsWith("admin_save_account_type")) {
        accountTypes.set(input.type_key, {
          id: input.type_key,
          label: input.type_label,
          can_review_data: input.review_data,
          can_manage_accounts: input.manage_accounts,
          builtin: accountTypes.get(input.type_key)?.builtin || false,
        });
        return json(null);
      }
      if (url.pathname.endsWith("admin_delete_account_type")) {
        accountTypes.delete(input.type_key);
        return json(null);
      }
    }
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
    if (url.pathname.includes("/rest/v1/annotation_reviews")) {
      const owner=url.searchParams.get("owner_id")?.replace("eq.",""), revision=Number(url.searchParams.get("dataset_revision")?.replace("eq.",""));
      return json([...annotationReviews.values()].filter(r=>r.owner_id===owner && r.dataset_revision===revision));
    }
    if (url.pathname.endsWith("/rpc/review_annotation")) {
      if(id!==A)return json({message:"Reviewer required"},403);
      const input=req.postDataJSON(), row=rows.get(input.target_owner);
      if(!row || row.revision!==input.expected_revision)return json({message:"Stale revision"},409);
      const review={owner_id:input.target_owner,dataset_revision:input.expected_revision,annotation_id:input.target_annotation,decision:input.new_decision,source_sha256:input.expected_sha256,reviewer_id:id,reviewed_at:new Date().toISOString()};
      annotationReviews.set(`${review.owner_id}:${review.dataset_revision}:${review.annotation_id}`,review);
      return json(null);
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
    if (req.method() === "DELETE" && url.pathname.endsWith("/storage/v1/object/guacabook-photos")) {
      if (faults.deletes > 0) { faults.deletes--; return json({ message: "Storage unavailable" }, 503); }
      const paths = req.postDataJSON().prefixes;
      for (const path of paths) objects.delete(path);
      return json(paths.map(name => ({ name })));
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
        const buffer=req.postDataBuffer();
        if(req.headers()["content-type"]?.includes("multipart/form-data")) {
          const form=await new Response(buffer,{headers:{"content-type":req.headers()["content-type"]}}).formData();
          const file=[...form.values()].find(value=>typeof value!=="string");
          objects.set(path,file?Buffer.from(await file.arrayBuffer()):Buffer.from(png,"base64"));
        } else objects.set(path,buffer || Buffer.from(png,"base64"));
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
  await page.route("**/api/admin/accounts", async route => {
    const req = route.request(), id = actor(req), input = req.postDataJSON();
    const current = managedUsers.get(id), target = managedUsers.get(input.userId);
    const reply = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (!current?.active || !accountTypes.get(current.type_id)?.can_manage_accounts || !target || target.protected || target.account_id === id)
      return reply({ error: "administrator" }, 403);
    if (input.confirmEmail !== target.email) return reply({ error: "confirmation" }, 400);
    if (input.action === "delete") {
      managedUsers.delete(target.account_id); rows.delete(target.account_id);
      for (const path of objects.keys()) if (path.startsWith(target.account_id + "/")) objects.delete(path);
    } else if (input.action === "ban") { target.active = false; target.banned = true; }
    else if (input.action === "unban") { target.banned = false; target.active = false; }
    else if (input.action === "suspend") target.active = false;
    else if (input.action === "activate" && !target.banned && !target.deletion_pending) target.active = true;
    else return reply({ error: "state" }, 409);
    return reply({ ok: true });
  });
  await page.route("**/api/admin/invitations", async (route) => {
    const req = route.request(),
      id = actor(req),
      current = managedUsers.get(id),
      type = accountTypes.get(current?.type_id),
      input = req.postDataJSON();
    const json = (value, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (!current?.active || !type?.can_manage_accounts)
      return json({ error: "administrator" }, 403);
    let target;
    if (input.action === "invite") {
      if ([...managedUsers.values()].some((u) => u.email === input.email))
        return json({ error: "existing" }, 409);
      const uid =
        "44444444-4444-4444-8444-" +
        String(managedUsers.size).padStart(12, "0");
      target = {
        account_id: uid,
        email: input.email,
        type_id: input.typeId,
        active: true,
        protected: false,
        created_at: new Date().toISOString(),
        email_confirmed_at: null,
        has_password: false,
      };
      managedUsers.set(uid, target);
    } else target = managedUsers.get(input.userId);
    const origin = new URL(req.url()).origin;
    if (input.delivery === "email") return json({ sent: true });
    return json({
      link: `${origin}/auth/${input.action === "invite" ? "invite" : "recover"}#access_token=${jwt({ id: target.account_id })}&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=${input.action === "invite" ? "invite" : "recovery"}`,
    });
  });
  return png;
}
