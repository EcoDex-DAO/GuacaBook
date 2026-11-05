import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import {
  setup,
  signIn,
  managedUsers,
  accountTypes,
  A,
  B,
  rows,
  objects,
} from "./supabase-mock.mjs";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
async function open() {
  const page = await browser.newPage({
    locale: "fr-FR",
    viewport: { width: 1440, height: 1100 },
  });
  page.setDefaultTimeout(20000);
  page.on("dialog", (d) => d.accept());
  await setup(page);
  return page;
}
try {
  const page = await open();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await signIn(page, "ecodexdao@gmail.com");
  await page
    .getByRole("button", { name: "Gestion des comptes", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Administration des comptes", exact: true })
    .waitFor();
  const root = page
    .locator(".managed-accounts>li")
    .filter({ has: page.getByText("ecodexdao@gmail.com", { exact: true }) });
  assert.equal(await root.getByRole("combobox").isDisabled(), true);
  for (const name of ["Suspendre ce compte", "Bannir ce compte", "Supprimer ce compte"])
    assert.equal(await root.getByRole("button", { name, exact: true }).isDisabled(), true);
  await page
    .getByRole("button", { name: "Types de compte", exact: true })
    .click();
  await page.getByLabel("Nom du type", { exact: true }).fill("Vétérinaire");
  await page
    .getByLabel("Consulter toutes les contributions", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "Enregistrer le type", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Type de compte enregistré." })
    .waitFor();
  assert.ok([...accountTypes.values()].some((t) => t.label === "Vétérinaire"));
  await page.getByRole("button", { name: "Comptes", exact: true }).click();
  await page
    .getByLabel("Adresse e-mail", { exact: true })
    .fill("invited@example.com");
  await page
    .getByRole("button", { name: "Créer le lien d’invitation", exact: true })
    .click();
  await page.getByLabel("Lien à transmettre en privé").waitFor();
  const link = await page
    .getByLabel("Lien à transmettre en privé")
    .inputValue();
  assert.match(link, /\/auth\/invite#/);
  await expect(page.getByRole("checkbox",{name:"Contributeur de photos",exact:true})).toBeChecked();
  await page.getByRole("checkbox",{name:"Vérificateur",exact:true}).check();
  await expect(page.getByRole("checkbox",{name:"Contributeur de photos",exact:true})).not.toBeChecked();
  await page
    .getByLabel("Adresse e-mail", { exact: true })
    .fill("by-mail@example.com");
  await page
    .getByRole("button", {
      name: "Envoyer l’invitation par e-mail",
      exact: true,
    })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Invitation envoyée par e-mail." })
    .waitFor();
  assert.equal([...managedUsers.values()].find(u=>u.email==='by-mail@example.com').type_id,'reviewer');
  await expect(page.getByRole("checkbox",{name:"Contributeur de photos",exact:true})).toBeChecked();
  // A new browser accepts the invite, chooses a password, then reconnects using it.
  const invited = await open();
  await invited.goto(link);
  await invited
    .getByRole("heading", { name: "Choisir votre mot de passe", exact: true })
    .waitFor();
  await invited
    .getByLabel("Nouveau mot de passe", { exact: true })
    .fill("a-strong-new-password");
  await invited
    .getByLabel("Confirmer le mot de passe", { exact: true })
    .fill("a-strong-new-password");
  await invited
    .getByRole("button", { name: "Enregistrer mon mot de passe", exact: true })
    .click();
  await invited.locator(".research-consent").waitFor();
  await invited.locator('.research-consent input[type="checkbox"]').check();
  await invited.getByRole("button", { name: "Accepter et continuer", exact: true }).click();
  await invited.getByLabel("Nom ou pseudonyme").waitFor();
  await invited
    .getByRole("button", { name: "Se déconnecter", exact: true })
    .click();
  await signIn(
    invited,
    "invited@example.com",
    (key) => key,
    "a-strong-new-password",
  );
  await invited.getByLabel("Nom ou pseudonyme").waitFor();
  assert.equal(
    await invited
      .getByRole("button", { name: "Gestion des comptes", exact: true })
      .count(),
    0,
  );
  // Root suspends an existing account through the manager.
  const row = page
    .locator(".managed-accounts>li")
    .filter({ has: page.getByText("b@example.com", { exact: true }) });
  await row.getByRole("button", { name: "Suspendre ce compte", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Annuler", exact: true }).click();
  assert.equal(managedUsers.get(B).active, true);
  await row.getByRole("button", { name: "Suspendre ce compte", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmer", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Compte mis à jour." })
    .waitFor();
  assert.equal(managedUsers.get(B).active, false);
  const blocked = await open();
  await blocked.goto(base);
  await signIn(blocked, "b@example.com", key => key, "test-password-123", false);
  await blocked
    .getByRole("alert")
    .filter({ hasText: "Ce compte est suspendu" })
    .waitFor();
  assert.equal(
    await blocked
      .getByRole("button", { name: "Créer un ara", exact: true })
      .count(),
    0,
  );
  async function moderate(name, cancel = false) {
    await row.getByRole("button", { name, exact: true }).click();
    const modal = page.getByRole("dialog");
    await modal.getByRole("button", { name: cancel ? "Annuler" : "Confirmer", exact: true }).click();
    await modal.waitFor({ state: "hidden" });
  }
  await moderate("Réactiver ce compte");
  assert.equal(managedUsers.get(B).active, true);
  await moderate("Bannir ce compte", true);
  assert.equal(!!managedUsers.get(B).banned, false);
  await moderate("Bannir ce compte");
  assert.equal(managedUsers.get(B).banned, true);
  assert.equal(managedUsers.get(B).active, false);
  await moderate("Lever le bannissement", true);
  assert.equal(managedUsers.get(B).banned, true);
  await moderate("Lever le bannissement");
  assert.equal(managedUsers.get(B).banned, false);
  assert.equal(managedUsers.get(B).active, false);
  await moderate("Réactiver ce compte");
  await row.getByRole("button", { name: "Supprimer ce compte", exact: true }).click();
  let modal = page.getByRole("dialog");
  assert.equal(await modal.getByRole("button", { name: "Confirmer", exact: true }).isDisabled(), true);
  await modal.getByRole("button", { name: "Annuler", exact: true }).click();
  assert.ok(managedUsers.has(B));
  objects.set(`${B}/orphan`, Buffer.from("original"));
  rows.set(B, { owner_id: B });
  await row.getByRole("button", { name: "Supprimer ce compte", exact: true }).click();
  modal = page.getByRole("dialog");
  await modal.getByLabel("Recopiez l’adresse e-mail pour confirmer la suppression").fill("wrong@example.com");
  assert.equal(await modal.getByRole("button", { name: "Confirmer", exact: true }).isDisabled(), true);
  await modal.getByLabel("Recopiez l’adresse e-mail pour confirmer la suppression").fill("b@example.com");
  await modal.getByRole("button", { name: "Confirmer", exact: true }).click();
  await modal.waitFor({ state: "hidden" });
  assert.equal(managedUsers.has(B), false);
  assert.equal(rows.has(B), false);
  assert.equal(objects.has(`${B}/orphan`), false);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: gestion admin, type personnalisé, invitation, choix du mot de passe, reconnexion, confirmations, suspension/réactivation, bannissement/levée, suppression complète, protection du compte initial et mobile (API simulée).",
  );
} finally {
  await browser.close();
}
