"use client";
import { useState } from "react";
import { useI18n, LanguagePicker } from "./I18n";
import type { CloudWorkspace } from "../../lib/useCloudWorkspace";
export const RESEARCH_CONSENT_VERSION = "guacabook-research-v1";
export default function ResearchConsent({ workspace, onAccepted }: { workspace: CloudWorkspace; onAccepted: () => void }) {
  const { t } = useI18n();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  return <main className="login research-consent">
    <LanguagePicker />
    <section>
      <div className="brand">◉ GuacaBook</div>
      <h1>{t("Bienvenue dans le projet de recherche GuacaBook")}</h1>
      <p>{t("GuacaBook collecte des photos d’aras et leurs annotations pour étudier la reconnaissance des espèces et l’identification individuelle. La fiabilité de cette identification reste à évaluer.")}</p>
      <p>{t("En participant, vous contribuez à un dataset de recherche : vos photos, les informations sur vos animaux et vos annotations sont enregistrées en ligne et accessibles aux responsables autorisés. Les contributions pourront être partagées sous licence CC BY 4.0, y compris pour des usages commerciaux, avec attribution.")}</p>
      <p>{t("Importez uniquement des photos dont vous détenez les droits. Vérifiez qu’elles ne contiennent pas de personnes, d’informations privées ou de métadonnées sensibles. Une licence CC BY 4.0 déjà accordée sur une copie diffusée ne peut pas être révoquée pour cette copie.")}</p>
      <p><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">{t("Lire la licence CC BY 4.0")}</a></p>
      <form onSubmit={async e => {
        e.preventDefault();
        if (!checked || busy) return;
        setBusy(true);
        workspace.update(d => ({ ...d, consent: true, researchConsent: { version: RESEARCH_CONSENT_VERSION, acceptedAt: new Date().toISOString() } }));
        try { await workspace.flush(); onAccepted(); } catch { /* Workspace displays the error; acceptance stays pending. */ }
        finally { setBusy(false); }
      }}>
        <label className="consent"><input type="checkbox" required checked={checked} disabled={busy} onChange={e => setChecked(e.target.checked)} />{t("J’ai compris le projet, je dispose des droits nécessaires et j’accepte de contribuer mes photos et annotations à la recherche sous licence CC BY 4.0.")}</label>
        <button className="primary" disabled={!checked || busy}>{t(busy ? "Enregistrement en ligne…" : "Accepter et continuer")}</button>
      </form>
      {workspace.error && <p role="alert">{t(workspace.error)}</p>}
    </section>
  </main>;
}
