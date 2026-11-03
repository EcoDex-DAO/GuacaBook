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
import { cloudConfigured, getSupabase } from "../../lib/supabase";
import { LanguagePicker, useI18n } from "./I18n";
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
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!cloudConfigured) return;
    let live = true;
    try {
      const supabase = getSupabase();
      setClient(supabase);
      supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (!live) return;
          if (error) setError("Connexion indisponible. Réessayez.");
          setUser(data.session?.user ?? null);
          setReady(true);
        })
        .catch(() => {
          if (live) {
            setError("Connexion indisponible. Réessayez.");
            setReady(true);
          }
        });
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (live) {
          if (_event === "SIGNED_OUT") {
            setSent(false);
            setEmail("");
            setCode("");
            setError("");
          }
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
  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    setError("");
    try {
      const { error } = sent
        ? await client.auth.verifyOtp({
            email: email.trim(),
            token: code.trim(),
            type: "email",
          })
        : await client.auth.signInWithOtp({
            email: email.trim(),
            options: { emailRedirectTo: window.location.origin },
          });
      if (error) throw error;
      setSent(true);
    } catch {
      setError(
        sent
          ? "Code invalide ou expiré. Demandez un nouveau code."
          : "Impossible d’envoyer le code. Vérifiez l’adresse et réessayez plus tard.",
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
          <h1>{t("Votre compte contributeur")}</h1>
          <p>
            {t(
              "Connectez-vous par e-mail pour retrouver votre collection privée sur plusieurs appareils.",
            )}
          </p>
          <form onSubmit={login}>
            <label>
              {t("Adresse e-mail")}
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                disabled={sent}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {sent && (
              <>
                <p role="status">
                  {t(
                    "Consultez votre e-mail : saisissez le code reçu ou ouvrez le lien de connexion.",
                  )}
                </p>
                <label>
                  {t("Code reçu par e-mail")}
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6,10}"
                    required
                  />
                </label>
              </>
            )}
            <button className="primary" disabled={busy || !client}>
              {t(
                busy
                  ? "Traitement…"
                  : sent
                    ? "Valider le code"
                    : "Recevoir un code",
              )}
            </button>
            {sent && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setSent(false);
                  setCode("");
                  setError("");
                }}
              >
                {t("Changer d’adresse ou demander un nouveau code")}
              </button>
            )}
          </form>
          {error && <p role="alert">{t(error)}</p>}
          <p className="small">
            {t(
              "Vos photos restent privées : vous et les responsables autorisés pouvez y accéder. Aucun mot de passe à créer.",
            )}
          </p>
        </section>
      </main>
    );
  return (
    <AccountContext.Provider value={{ user, client, registerBeforeSignOut }}>
      <div className="accountbar">
        <span>
          {t("Compte connecté")} · {user.email}
        </span>
        <button
          disabled={busy}
          onClick={async () => {
            if (!client) return;
            setBusy(true);
            try {
              await beforeSignOut.current?.();
              const { error } = await client.auth.signOut({ scope: "local" });
              if (error) throw error;
            } catch {
              setError(
                "Déconnexion interrompue : sauvegardez vos modifications avant de quitter.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("Se déconnecter")}
        </button>
        {error && <span role="alert">{t(error)}</span>}
      </div>
      <Fragment key={user.id}>{children}</Fragment>
    </AccountContext.Provider>
  );
}
