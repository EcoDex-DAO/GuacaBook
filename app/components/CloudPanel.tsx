"use client";
import { useEffect, useState } from "react";
import { get } from "idb-keyval";
import JSZip from "jszip";
import type { Dataset } from "../../lib/dataset";
import { coco } from "../../lib/dataset";
import {
  CloudRow,
  readCloudRow,
  loadCloudDataset,
  saveCloudDataset,
} from "../../lib/cloud";
import { useAccount } from "./AccountGate";
import { useI18n } from "./I18n";
export default function CloudPanel({
  data,
  onLoad,
}: {
  data: Dataset;
  onLoad: (d: Dataset) => void;
}) {
  const { user, client } = useAccount(),
    { t } = useI18n();
  const [baseline, setBaseline] = useState<number | null | undefined>(),
    [exists, setExists] = useState(false),
    [remoteStatus, setRemoteStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [admin, setAdmin] = useState(false),
    [rows, setRows] = useState<CloudRow[]>([]),
    [savedData, setSavedData] = useState<Dataset | null>(null);
  const dirty = data !== savedData;
  useEffect(() => {
    if (!user || !client) return;
    let live = true;
    readCloudRow(client, user.id)
      .then((row) => {
        if (!live) return;
        setExists(!!row);
        setRemoteStatus(row?.status || "");
        if (!row) setBaseline(null);
      })
      .catch(() => {
        if (live)
          setError(
            "Sauvegarde en ligne inaccessible. Vérifiez la configuration et réessayez.",
          );
      });
    client.rpc("is_research_admin").then(({ data }) => {
      if (live) setAdmin(data === true);
    });
    return () => {
      live = false;
    };
  }, [user?.id, client]);
  if (!user || !client) return null;
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      const known = e instanceof Error ? e.message : "";
      setError(
        [
          "Limite bêta : 100 photos par collection.",
          "Une photo dépasse 15 Mo.",
          "La sauvegarde en ligne accepte JPEG, PNG et WebP. Convertissez les autres formats.",
          "Une autre version existe en ligne. Rechargez-la avant de sauvegarder.",
        ].includes(known)
          ? known
          : "Opération en ligne impossible. Vérifiez la connexion, la configuration et les quotas, puis réessayez.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    if (!client || !user) return;
    const row = await readCloudRow(client, user.id);
    if (!row) throw new Error("Missing collection");
    const restored = await loadCloudDataset(client, row);
    onLoad(restored);
    setBaseline(row.revision);
    setExists(true);
    setRemoteStatus(row.status);
    setSavedData(restored);
    setMessage("Collection chargée depuis votre compte.");
  }
  async function save() {
    if (!client || !user || baseline === undefined) return;
    const row = await saveCloudDataset(client, user.id, data, baseline);
    setBaseline(row.revision);
    setExists(true);
    setRemoteStatus(row.status);
    setSavedData(data);
    setMessage("Collection sauvegardée en ligne.");
  }
  async function adminExport(row: CloudRow) {
    if (!client) return;
    const dataset = await loadCloudDataset(client, row);
    const zip = new JSZip();
    zip.file("annotations.json", JSON.stringify(coco(dataset), null, 2));
    for (const p of dataset.photos)
      zip.file(`images/${p.id}-${p.name}`, p.blob);
    const u = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
    const a = document.createElement("a");
    a.href = u;
    a.download = `guacabook-${row.owner_id}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 30000);
  }
  return (
    <section className="cloudpanel">
      <h2>{t("Votre sauvegarde en ligne privée")}</h2>
      <p>
        {t(
          "Les brouillons se sauvegardent sur cet appareil. Cliquez sur « Sauvegarder en ligne » pour les retrouver ailleurs. Les responsables autorisés peuvent consulter les contributions.",
        )}
      </p>
      {exists && baseline === undefined && (
        <p className="notice">
          {t(
            "Une collection existe déjà sur votre compte. Chargez-la avant de sauvegarder pour éviter de l’écraser.",
          )}
        </p>
      )}
      <div className="cloudactions">
        <button
          disabled={busy || baseline === undefined}
          onClick={() => run(save)}
        >
          {t("Sauvegarder en ligne")}
        </button>
        <button
          disabled={busy || !exists}
          onClick={() => {
            if (
              confirm(
                t(
                  "Charger la version en ligne remplacera le brouillon de ce compte sur cet appareil. Exportez-le avant de continuer si nécessaire.",
                ),
              )
            )
              void run(load);
          }}
        >
          {t("Charger la version en ligne")}
        </button>
        <button
          disabled={
            busy ||
            !data.consent ||
            !data.photos.length ||
            dirty ||
            baseline == null
          }
          onClick={() =>
            run(async () => {
              const { data: revision, error } = await client.rpc(
                "submit_dataset",
                { expected_revision: baseline },
              );
              if (error) throw error;
              setBaseline(Number(revision));
              setRemoteStatus("submitted");
              setMessage(
                "Collection soumise avec votre autorisation CC BY 4.0.",
              );
            })
          }
        >
          {t("Soumettre ma collection à la recherche")}
        </button>
      </div>
      <p className="small">
        {t(
          remoteStatus === "submitted"
            ? "État en ligne : soumise pour recherche."
            : "État en ligne : brouillon privé.",
        )}{" "}
        {t(
          "Soumission : sauvegardez d’abord vos modifications et cochez l’autorisation CC BY 4.0 en bas de page.",
        )}
      </p>
      <details>
        <summary>{t("Transférer un ancien brouillon local")}</summary>
        <p>
          {t(
            "Ce transfert est volontaire. Il remplace le brouillon de ce compte sur cet appareil ; sauvegardez ou exportez votre travail avant de continuer.",
          )}
        </p>
        <button
          disabled={busy}
          onClick={() => {
            if (
              confirm(
                t("Importer le brouillon local historique dans ce compte ?"),
              )
            )
              void run(async () => {
                const legacy = await get<Dataset>("guacabook-v1");
                if (!legacy) {
                  setMessage("Aucun ancien brouillon local trouvé.");
                  return;
                }
                onLoad({ ...legacy, consent: false });
                setMessage(
                  "Ancien brouillon importé localement. Vérifiez-le puis sauvegardez-le en ligne.",
                );
              });
          }}
        >
          {t("Importer mon ancien brouillon")}
        </button>
      </details>
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
