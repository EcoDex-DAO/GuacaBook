"use client";
import { useEffect, useState } from "react";

import JSZip from "jszip";
import { coco } from "../../lib/dataset";
import { CloudRow, readCloudRow, loadCloudDataset } from "../../lib/cloud";

import type { CloudWorkspace } from "../../lib/useCloudWorkspace";
import { useAccount } from "./AccountGate";
import { useI18n } from "./I18n";
export default function CloudPanel({
  workspace: w,
}: {
  workspace: CloudWorkspace;
}) {
  const { user, client } = useAccount(),
    { t } = useI18n();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [admin, setAdmin] = useState(false),
    [rows, setRows] = useState<CloudRow[]>([]);
  useEffect(() => {
    if (!client) return;
    let live = true;
    client.rpc("is_research_admin").then(({ data }) => {
      if (live) setAdmin(data === true);
    });
    return () => {
      live = false;
    };
  }, [client]);
  if (!user || !client) return null;
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      const key = e instanceof Error ? e.message : "";
      setError(
        [
          "Des annotations différentes existent déjà pour le même animal ou la même photo. Exportez vos copies avant de les rapprocher.",
          "La copie locale a changé. Elle n’a pas été effacée.",
        ].includes(key)
          ? key
          : "Opération en ligne impossible. Vérifiez la connexion, la configuration et les quotas, puis réessayez.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function backup() {
    const zip = new JSZip();
    zip.file(
      "recovery.json",
      JSON.stringify(
        { ...w.data, photos: w.data.photos.map(({ blob, ...p }) => p) },
        null,
        2,
      ),
    );
    for (const p of w.data.photos) zip.file(`images/${p.id}-${p.name}`, p.blob);
    await download(zip, "guacabook-recovery.zip");
  }
  async function download(zip: JSZip, name: string) {
    const u = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
    const a = document.createElement("a");
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 30000);
  }
  async function adminExport(row: CloudRow) {
    if (!client) return;
    const dataset = await loadCloudDataset(client, row);
    const zip = new JSZip();
    zip.file("annotations.json", JSON.stringify(coco(dataset), null, 2));
    for (const p of dataset.photos)
      zip.file(`images/${p.id}-${p.name}`, p.blob);
    await download(zip, `guacabook-${row.owner_id}.zip`);
  }
  return (
    <section className="cloudpanel">
      <h2>{t("Votre collection centralisée")}</h2>
      <p>
        {t(
          "Les animaux, photos et annotations sont chargés depuis votre compte et enregistrés automatiquement en ligne. Aucun nouveau brouillon n’est conservé dans le navigateur.",
        )}
      </p>
      <p role="status">
        {t(
          w.saving
            ? "Enregistrement en ligne…"
            : w.dirty
              ? "Modifications en attente d’enregistrement…"
              : "Toutes les modifications sont enregistrées en ligne.",
        )}
      </p>
      {w.error && (
        <div role="alert">
          <p>{t(w.error)}</p>
          <p>
            {t(
              "Conservez cette page ouverte. Téléchargez une copie de secours avant de recharger si vous avez des modifications non enregistrées.",
            )}
          </p>
        </div>
      )}
      <div className="cloudactions">
        {w.error && (
          <button
            disabled={busy || w.saving}
            onClick={() => run(() => w.flush())}
          >
            {t("Réessayer la sauvegarde")}
          </button>
        )}
        <button
          disabled={busy || w.saving}
          onClick={() => {
            if (
              !w.dirty ||
              confirm(
                t(
                  "Recharger la collection en ligne abandonnera les modifications non enregistrées. Téléchargez une copie de secours avant de continuer.",
                ),
              )
            )
              void run(() => w.reload());
          }}
        >
          {t("Actualiser depuis le projet")}
        </button>
        <button
          disabled={
            busy ||
            !w.data.consent ||
            !w.data.photos.length ||
            w.saving ||
            !!w.error
          }
          onClick={() =>
            run(async () => {
              await w.submit();
              setMessage(
                "Collection soumise avec votre autorisation CC BY 4.0.",
              );
            })
          }
        >
          {t("Soumettre ma collection à la recherche")}
        </button>
        {w.error && (
          <button disabled={busy} onClick={() => run(backup)}>
            {t("Télécharger une copie de secours")}
          </button>
        )}
      </div>
      <p className="small">
        {t(
          w.remoteStatus === "submitted"
            ? "État en ligne : soumise pour recherche."
            : "État en ligne : brouillon privé.",
        )}
      </p>
      {admin && (
        <details>
          <summary>{t("Administration des contributions")}</summary>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const { data, error } = await client
                  .from("contributor_datasets")
                  .select("*")
                  .order("updated_at", { ascending: false });
                if (error) throw error;
                setRows(data || []);
              })
            }
          >
            {t("Actualiser les contributions")}
          </button>
          <ul className="photolist">
            {rows.map((row) => (
              <li key={row.owner_id}>
                <span>
                  {row.dataset.profile || row.owner_id} ·{" "}
                  {row.dataset.photos.length} {t("photos")} ·{" "}
                  {t(row.status === "submitted" ? "Soumise" : "Brouillon")}
                </span>
                <button
                  disabled={busy || row.status !== "submitted"}
                  onClick={() => run(() => adminExport(row))}
                >
                  {t("Exporter la contribution COCO")}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {busy && <p role="status">{t("Transfert en cours…")}</p>}
      {message && <p role="status">{t(message)}</p>}
      {error && <p role="alert">{t(error)}</p>}
      <p className="small">
        {t(
          "Bêta : 100 photos maximum par compte, 15 Mo par photo, JPEG / PNG / WebP. Les originaux peuvent conserver des métadonnées privées ; vérifiez-les avant l’envoi.",
        )}
      </p>
    </section>
  );
}
