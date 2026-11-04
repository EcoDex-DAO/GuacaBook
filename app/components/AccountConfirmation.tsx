"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "./I18n";
export default function AccountConfirmation({ title, description, email, permanent, errorMessage, onCancel, onConfirm }: {
  title: string; description: string; email: string; permanent: boolean; errorMessage?: string;
  onCancel: () => void; onConfirm: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [typedEmail, setTypedEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const { t } = useI18n();
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="delete-dialog" aria-labelledby="account-confirm-title" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="account-confirm-title">{title}</h2>
    <p><strong>{email}</strong></p>
    <p>{description}</p>
    {permanent && <label>{t("Recopiez l’adresse e-mail pour confirmer la suppression")}
      <input type="email" autoComplete="off" value={typedEmail} disabled={busy} onChange={event => setTypedEmail(event.target.value)} />
    </label>}
    <div className="cloudactions">
      <button autoFocus disabled={busy} onClick={onCancel}>{t("Annuler")}</button>
      <button className={permanent ? "delete-animal" : "primary"} disabled={busy || (permanent && typedEmail !== email)} onClick={async () => {
        setBusy(true); setFailed(false);
        try { await onConfirm(); } catch { setFailed(true); } finally { setBusy(false); }
      }}>{t(busy ? "Traitement…" : "Confirmer")}</button>
    </div>
    {failed && <p role="alert">{t(errorMessage || "L’opération n’est pas terminée. Vérifiez la configuration et réessayez. Un compte en cours de suppression reste bloqué.")}</p>}
  </dialog>;
}
