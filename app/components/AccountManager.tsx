"use client";
import { useEffect, useState } from "react";
import { useAccount } from "./AccountGate";
import { useI18n } from "./I18n";
import type { AccountType, ManagedAccount } from "../../lib/accounts";
export default function AccountManager() {
  const { client, user } = useAccount(),
    { t } = useI18n();
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]),
    [types, setTypes] = useState<AccountType[]>([]),
    [tab, setTab] = useState("accounts"),
    [email, setEmail] = useState(""),
    [inviteType, setInviteType] = useState("contributor"),
    [search, setSearch] = useState(""),
    [link, setLink] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [edits, setEdits] = useState<
      Record<string, { type: string; active: boolean }>
    >({}),
    [typeId, setTypeId] = useState(""),
    [label, setLabel] = useState(""),
    [review, setReview] = useState(false),
    [manage, setManage] = useState(false);
  const editing = types.find((type) => type.id === typeId);
  const typeName = (type: AccountType) => {
    const defaults: Record<string, string> = {
      admin: "Administrateur",
      contributor: "Contributeur",
      reviewer: "Réviseur",
    };
    return type.builtin && type.label === defaults[type.id]
      ? t(type.label)
      : type.label;
  };
  async function refresh() {
    if (!client) return;
    const [a, b] = await Promise.all([
      client.rpc("admin_list_accounts"),
      client.rpc("admin_list_account_types"),
    ]);
    if (a.error || b.error) throw new Error();
    setAccounts(a.data || []);
    setTypes(b.data || []);
    setEdits({});
  }
  useEffect(() => {
    void run(refresh);
  }, [client]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch {
      setError(
        "Opération refusée ou indisponible. Vérifiez vos droits et réessayez.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function generate(
    action: "invite" | "reset",
    userId?: string,
    delivery?: string,
  ) {
    if (!client) return;
    setLink("");
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session) throw new Error();
    const response = await fetch("/api/admin/invitations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action,
        email,
        typeId: inviteType,
        userId,
        delivery,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(
        data.error === "existing"
          ? "Ce compte existe déjà. Utilisez sa ligne pour générer un lien de mot de passe."
          : data.error === "configuration_or_service"
            ? "Impossible de générer le lien. Vérifiez la clé serveur et la configuration Supabase."
            : "Opération refusée ou indisponible. Vérifiez vos droits et réessayez.",
      );
      return;
    }
    setLink(data.link || "");
    if (data.sent) setMessage("Invitation envoyée par e-mail.");
    setEmail("");
    await refresh();
  }
  function resetType() {
    setTypeId("");
    setLabel("");
    setReview(false);
    setManage(false);
  }
  return (
    <main>
      <h1>{t("Administration des comptes")}</h1>
      <p>
        {t(
          "Espace réservé aux administrateurs. Les droits sont vérifiés côté serveur pour chaque opération.",
        )}
      </p>
      <nav className="tabs" aria-label={t("Gestion des comptes")}>
        <button
          aria-current={tab === "accounts" ? "page" : undefined}
          onClick={() => setTab("accounts")}
        >
          {t("Comptes")}
        </button>
        <button
          aria-current={tab === "types" ? "page" : undefined}
          onClick={() => setTab("types")}
        >
          {t("Types de compte")}
        </button>
      </nav>
      {error && (
        <p role="alert" className="notice">
          {t(error)}
        </p>
      )}
      {message && <p role="status">{t(message)}</p>}
      {tab === "accounts" ? (
        <>
          <section className="adminsection">
            <h2>{t("Inviter une personne")}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => generate("invite", undefined, "email"));
              }}
            >
              <label>
                {t("Adresse e-mail")}
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                {t("Type du compte invité")}
                <select
                  value={inviteType}
                  onChange={(e) => setInviteType(e.target.value)}
                >
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {typeName(type)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary" disabled={busy || !types.length}>
                {t("Envoyer l’invitation par e-mail")}
              </button>
              <button
                type="button"
                disabled={busy || !types.length}
                onClick={() => void run(() => generate("invite"))}
              >
                {t("Créer le lien d’invitation")}
              </button>
            </form>
            {link && (
              <div className="invitation-result">
                <label>
                  {t("Lien à transmettre en privé")}
                  <textarea readOnly value={link} rows={3} />
                </label>
                <p className="small">
                  {t(
                    "Ce lien donne accès au compte invité. Transmettez-le uniquement à son destinataire. Il permet de choisir un mot de passe.",
                  )}
                </p>
                <button
                  onClick={() =>
                    run(async () => {
                      await navigator.clipboard.writeText(link);
                      setMessage("Lien copié.");
                    })
                  }
                >
                  {t("Copier le lien")}
                </button>
              </div>
            )}
          </section>
          <section className="adminsection">
            <h2>{t("Comptes enregistrés")}</h2>
            <label>
              {t("Rechercher par e-mail")}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button disabled={busy} onClick={() => run(refresh)}>
              {t("Actualiser")}
            </button>
            <ul className="managed-accounts">
              {accounts
                .filter((a) =>
                  a.email.toLowerCase().includes(search.toLowerCase()),
                )
                .map((a) => {
                  const edit = edits[a.account_id] || {
                    type: a.type_id,
                    active: a.active,
                  };
                  return (
                    <li key={a.account_id}>
                      <strong>{a.email}</strong>
                      <p className="small">
                        {t(
                          a.email_confirmed_at
                            ? "E-mail confirmé"
                            : "Invitation à accepter",
                        )}{" "}
                        ·{" "}
                        {t(
                          a.has_password
                            ? "Mot de passe défini"
                            : "Mot de passe à définir",
                        )}
                        {a.protected ? ` · ${t("Administrateur protégé")}` : ""}
                      </p>
                      <label>
                        {t("Type de compte")}
                        <select
                          aria-label={`${t("Type de compte")} · ${a.email}`}
                          disabled={a.protected || busy}
                          value={edit.type}
                          onChange={(e) =>
                            setEdits({
                              ...edits,
                              [a.account_id]: { ...edit, type: e.target.value },
                            })
                          }
                        >
                          {types.map((type) => (
                            <option key={type.id} value={type.id}>
                              {typeName(type)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={edit.active}
                          disabled={
                            a.protected || a.account_id === user?.id || busy
                          }
                          onChange={(e) =>
                            setEdits({
                              ...edits,
                              [a.account_id]: {
                                ...edit,
                                active: e.target.checked,
                              },
                            })
                          }
                        />
                        {t("Compte actif")}
                      </label>
                      <div className="cloudactions">
                        <button
                          disabled={a.protected || busy}
                          onClick={() =>
                            run(async () => {
                              const { error } = await client!.rpc(
                                "admin_set_account",
                                {
                                  target_user: a.account_id,
                                  new_type: edit.type,
                                  new_active: edit.active,
                                },
                              );
                              if (error) throw error;
                              await refresh();
                              setMessage("Compte mis à jour.");
                            })
                          }
                        >
                          {t("Enregistrer le compte")}
                        </button>
                        <button
                          disabled={
                            busy ||
                            !a.active ||
                            (a.protected && a.account_id !== user?.id)
                          }
                          onClick={() =>
                            run(() => generate("reset", a.account_id))
                          }
                        >
                          {t("Créer un lien de mot de passe")}
                        </button>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </section>
        </>
      ) : (
        <div className="batchgrid adminsection">
          <section>
            <h2>{t(typeId ? "Modifier un type" : "Créer un type")}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const { error } = await client!.rpc(
                    "admin_save_account_type",
                    {
                      type_key: typeId || `type-${crypto.randomUUID()}`,
                      type_label: label,
                      review_data: review,
                      manage_accounts: manage,
                    },
                  );
                  if (error) throw error;
                  resetType();
                  await refresh();
                  setMessage("Type de compte enregistré.");
                });
              }}
            >
              <label>
                {t("Nom du type")}
                <input
                  required
                  maxLength={80}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={review}
                  disabled={!!editing?.builtin || manage}
                  onChange={(e) => setReview(e.target.checked)}
                />
                {t("Consulter toutes les contributions")}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={manage}
                  disabled={!!editing?.builtin}
                  onChange={(e) => {
                    setManage(e.target.checked);
                    if (e.target.checked) setReview(true);
                  }}
                />
                {t("Administrer les comptes et les types")}
              </label>
              <p className="small">
                {t(
                  "Sans ces permissions, le compte accède uniquement à sa propre collection. Les types intégrés conservent leurs permissions.",
                )}
              </p>
              <button disabled={busy} className="primary">
                {t("Enregistrer le type")}
              </button>
              {typeId && (
                <button type="button" onClick={resetType}>
                  {t("Annuler")}
                </button>
              )}
            </form>
          </section>
          <section>
            <h2>{t("Types disponibles")}</h2>
            <ul className="managed-accounts">
              {types.map((type) => (
                <li key={type.id}>
                  <strong>{typeName(type)}</strong>
                  <p className="small">
                    {t(
                      type.can_manage_accounts
                        ? "Gestion des comptes et des contributions"
                        : type.can_review_data
                          ? "Consultation des contributions"
                          : "Collection personnelle uniquement",
                    )}
                  </p>
                  <div className="cloudactions">
                    <button
                      onClick={() => {
                        setTypeId(type.id);
                        setLabel(type.label);
                        setReview(type.can_review_data);
                        setManage(type.can_manage_accounts);
                      }}
                    >
                      {t("Modifier")}
                    </button>
                    {!type.builtin && (
                      <button
                        disabled={
                          busy || accounts.some((a) => a.type_id === type.id)
                        }
                        onClick={() => {
                          if (confirm(t("Supprimer ce type non attribué ?")))
                            void run(async () => {
                              const { error } = await client!.rpc(
                                "admin_delete_account_type",
                                { type_key: type.id },
                              );
                              if (error) throw error;
                              resetType();
                              await refresh();
                            });
                        }}
                      >
                        {t("Supprimer")}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}
