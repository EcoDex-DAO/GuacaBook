"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  Fragment,
  useRef,
  useCallback,
} from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AccountProfile } from "../../lib/accounts";
import { cloudConfigured, getSupabase } from "../../lib/supabase";
import { LanguagePicker, useI18n } from "./I18n";
import AccountManager from "./AccountManager";
const AccountContext = createContext<{
  user: User | null;
  client: SupabaseClient | null;
  registerBeforeSignOut: (fn: () => Promise<void>) => () => void;
}>({ user: null, client: null, registerBeforeSignOut: () => () => {} });
export const useAccount = () => useContext(AccountContext);
export default function AccountGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const beforeSignOut = useRef<null | (() => Promise<void>)>(null);
  const registerBeforeSignOut = useCallback((fn: () => Promise<void>) => {
    beforeSignOut.current = fn;
    return () => {
      if (beforeSignOut.current === fn) beforeSignOut.current = null;
    };
  }, []);
  const [client, setClient] = useState<SupabaseClient | null>(null),
    [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(!cloudConfigured),
    [account, setAccount] = useState<AccountProfile | null>(null),
    [accountReady, setAccountReady] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [flow, setFlow] = useState(false),
    [forgot, setForgot] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [manage, setManage] = useState(false);
  useEffect(() => {
    if (!cloudConfigured) return;
    let live = true;
    const path = window.location.pathname;
    setFlow(path === "/auth/invite" || path === "/auth/recover");
    if (window.location.hash.includes("error="))
      setError("Lien invalide ou expiré. Demandez un nouveau lien.");
    try {
      const sb = getSupabase();
      setClient(sb);
      sb.auth
        .getSession()
        .then(({ data, error }) => {
          if (live) {
            if (error) setError("Connexion indisponible. Réessayez.");
            setUser(data.session?.user ?? null);
            setReady(true);
          }
        })
        .catch(() => {
          if (live) {
            setError("Connexion indisponible. Réessayez.");
            setReady(true);
          }
        });
      const {
        data: { subscription },
      } = sb.auth.onAuthStateChange((event, session) => {
        if (live) {
          if (event === "SIGNED_OUT") {
            setEmail("");
            setPassword("");
            setNewPassword("");
            setRepeat("");
            setError("");
            setMessage("");
            setManage(false);
          }
          if (event === "PASSWORD_RECOVERY") setFlow(true);
          setUser(session?.user ?? null);
          setReady(true);
        }
      });
      return () => {
        live = false;
        subscription.unsubscribe();
      };
    } catch {
      setError("Configuration Supabase invalide.");
      setReady(true);
    }
  }, []);
  const refreshAccount = useCallback(async () => {
    if (!client || !user) return null;
    const { data, error } = await client.rpc("my_account");
    if (error || !data) throw new Error("Account configuration");
    setAccount(data as AccountProfile);
    return data as AccountProfile;
  }, [client, user?.id]);
  useEffect(() => {
    if (!user) {
      setAccount(null);
      setAccountReady(false);
      return;
    }
    let live = true;
    setAccount(null);
    setAccountReady(false);
    async function load() {
      try {
        const { data, error } = await client!.rpc("my_account");
        if (!live) return;
        if (error || !data) throw new Error();
        setAccount(data);
        setAccountReady(true);
      } catch {
        if (live) {
          setAccountReady(true);
          setError(
            "Gestion des comptes indisponible. Vérifiez la migration 002.",
          );
        }
      }
    }
    void load();
    const focus = () => void load();
    window.addEventListener("focus", focus);
    const timer = setInterval(focus, 60000);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [client, user?.id]);
  async function signOut() {
    if (!client) return;
    setBusy(true);
    try {
      await beforeSignOut.current?.();
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
      setFlow(false);
      window.history.replaceState({}, "", "/");
    } catch {
      setError(
        "Déconnexion interrompue : sauvegardez vos modifications avant de quitter.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (forgot) {
        const { error } = await client.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${window.location.origin}/auth/recover` },
        );
        if (error) throw error;
        setMessage(
          "Si ce compte existe, un lien de réinitialisation a été envoyé.",
        );
      } else {
        const { error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        setPassword("");
      }
    } catch {
      setError(
        forgot
          ? "Impossible d’envoyer le lien. Réessayez plus tard."
          : "Adresse e-mail ou mot de passe incorrect.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function choosePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    if (newPassword !== repeat) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) throw error;
      await refreshAccount();
      setFlow(false);
      setNewPassword("");
      setRepeat("");
      window.history.replaceState({}, "", "/");
    } catch {
      setError(
        "Impossible de définir le mot de passe. Vérifiez sa longueur ou demandez un nouveau lien.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!cloudConfigured)
    return (
      <main>
        <LanguagePicker />
        <h1>GuacaBook</h1>
        <p role="alert">
          {t(
            "La connexion au projet centralisé n’est pas configurée. Contactez le responsable du site.",
          )}
        </p>
      </main>
    );
  if (!ready)
    return (
      <main>
        <LanguagePicker />
        <p role="status">{t("Vérification de la connexion…")}</p>
      </main>
    );
  if (!user)
    return (
      <main className="login">
        <LanguagePicker />
        <div className="brand">◉ GuacaBook</div>
        <section>
          <h1>
            {t(
              forgot
                ? "Réinitialiser le mot de passe"
                : "Connexion à GuacaBook",
            )}
          </h1>
          <p>
            {t(
              "Les nouveaux comptes sont créés sur invitation d’un administrateur.",
            )}
          </p>
          <form onSubmit={login}>
            <label>
              {t("Adresse e-mail")}
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {!forgot && (
              <label>
                {t("Mot de passe")}
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            <button className="primary" disabled={busy || !client}>
              {t(
                busy
                  ? "Traitement…"
                  : forgot
                    ? "Envoyer le lien de réinitialisation"
                    : "Se connecter",
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setForgot(!forgot);
                setError("");
                setMessage("");
              }}
            >
              {t(forgot ? "Revenir à la connexion" : "Mot de passe oublié ?")}
            </button>
          </form>
          {error && <p role="alert">{t(error)}</p>}
          {message && <p role="status">{t(message)}</p>}
        </section>
      </main>
    );
  const toolbar = (
    <div className="accountbar">
      <span>
        {t("Compte connecté")} · {user.email}
      </span>
      <button disabled={busy} onClick={() => void signOut()}>
        {t("Se déconnecter")}
      </button>
      {error && <span role="alert">{t(error)}</span>}
    </div>
  );
  if (!accountReady || (account && account.user_id !== user.id))
    return (
      <main>
        <LanguagePicker />
        <p role="status">{t("Vérification des droits du compte…")}</p>
      </main>
    );
  if (!account || !account.active)
    return (
      <>
        {toolbar}
        <main>
          <LanguagePicker />
          <p role="alert">
            {t(
              !account
                ? "Gestion des comptes indisponible. Vérifiez la migration 002."
                : account?.deletion_pending ? "Ce compte est en cours de suppression." : account?.banned ? "Ce compte est banni. Contactez un administrateur." : "Ce compte est suspendu ou n’a pas encore été activé par un administrateur.",
            )}
          </p>
        </main>
      </>
    );
  if (flow || !account.has_password)
    return (
      <>
        {toolbar}
        <main className="login">
          <LanguagePicker />
          <section>
            <h1>{t("Choisir votre mot de passe")}</h1>
            <p>{user.email}</p>
            <p>
              {t(
                "Choisissez au moins 12 caractères. Ce mot de passe servira à vos prochaines connexions.",
              )}
            </p>
            <form onSubmit={choosePassword}>
              <label>
                {t("Nouveau mot de passe")}
                <input
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </label>
              <label>
                {t("Confirmer le mot de passe")}
                <input
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  required
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                />
              </label>
              <button className="primary" disabled={busy}>
                {t("Enregistrer mon mot de passe")}
              </button>
            </form>
            {error && <p role="alert">{t(error)}</p>}
          </section>
        </main>
      </>
    );
  return (
    <AccountContext.Provider value={{ user, client, registerBeforeSignOut }}>
      <div className="accountbar">
        <span>
          {t("Compte connecté")} · {user.email}
        </span>
        {account.can_manage_accounts && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await beforeSignOut.current?.();
                setManage(!manage);
              } catch {
                setError(
                  "Sauvegardez vos modifications avant de changer d’espace.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {t(manage ? "Retour au dataset" : "Gestion des comptes")}
          </button>
        )}
        <button disabled={busy} onClick={() => void signOut()}>
          {t("Se déconnecter")}
        </button>
        {error && <span role="alert">{t(error)}</span>}
      </div>
      <Fragment key={user.id}>
        {manage && account.can_manage_accounts ? (
          <>
            <LanguagePicker />
            <AccountManager />
          </>
        ) : (
          children
        )}
      </Fragment>
    </AccountContext.Provider>
  );
}
