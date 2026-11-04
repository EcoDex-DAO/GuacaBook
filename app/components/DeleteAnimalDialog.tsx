"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "./I18n";
export default function DeleteAnimalDialog({ name, count, onCancel, onDelete }: { name: string; count: number; onCancel: () => void; onDelete: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="delete-dialog" aria-labelledby="delete-animal-title" onCancel={e => { e.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="delete-animal-title">{t("Supprimer « {name} » ?", { name })}</h2>
    <p>{t("L’animal, ses photos ({count}) et toutes les annotations de ces photos seront supprimés définitivement de votre compte et du stockage en ligne. Une photo contenant plusieurs animaux sera également supprimée.", { count })}</p>
    <div className="cloudactions">
      <button autoFocus disabled={busy} onClick={onCancel}>{t("Annuler")}</button>
      <button className="delete-animal" disabled={busy} onClick={async () => {
        setBusy(true); setFailed(false);
        try { await onDelete(); } catch { setFailed(true); } finally { setBusy(false); }
      }}>{t(busy ? "Suppression en cours…" : failed ? "Réessayer la suppression" : "Supprimer définitivement")}</button>
    </div>
    {failed && <p role="alert">{t("La suppression n’est pas terminée. Réessayez pour supprimer aussi les fichiers en ligne.")}</p>}
  </dialog>;
}
