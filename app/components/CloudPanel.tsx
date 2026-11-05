"use client";
import { useEffect, useState } from "react";

import JSZip from "jszip";
import {approvedDataset,birdsSnapshot,photoSnapshot,loadReviewedDataset,type PhotoReview} from "../../lib/photoReviews";
import { researchDataset } from "../../lib/researchExport";
import { stepValid } from "../../lib/dataset";
import { CloudRow, loadCloudDataset } from "../../lib/cloud";

import { buildV1Archive } from "../../lib/v1Archive";
import type { Review } from "../../lib/v1";
import type { CloudWorkspace } from "../../lib/useCloudWorkspace";
import { useAccount } from "./AccountGate";
import { useI18n } from "./I18n";
export function CloudActions({
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
          "Revue indisponible. Exécutez la migration 004 et rechargez les contributions.",
          "Galerie indisponible. Appliquez la migration 005 dans Supabase, puis actualisez.",
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
    const reviews=await loadReviews(row);
    const decisions=await loadPhotoReviews(row);
    const dataset=await loadReviewedDataset(client,row,decisions);
    const {zip,report}=await buildV1Archive(dataset,reviews,decisions);
    if(!report.images){setMessage("Aucune photo validée par un vérificateur à exporter.");return;}
    zip.file("manifest.json",JSON.stringify({owner_id:row.owner_id,revision:row.revision,contributor:row.dataset.profile},null,2));
    await download(zip, `guacabook-v1-${row.owner_id}.zip`);
  }
  async function loadReviews(row: CloudRow) {
    if(!client)throw new Error("Authentication required");
    const {data,error}=await client.from("annotation_reviews").select("*").eq("owner_id",row.owner_id).eq("dataset_revision",row.revision);
    if(error)throw new Error("Revue indisponible. Exécutez la migration 004 et rechargez les contributions.");
    return new Map<string,Review>((data||[]).map(r=>[r.annotation_id,r]));
  }
  async function loadPhotoReviews(row:CloudRow) {
    if(!client)throw new Error("Authentication required");
    const {data,error}=await client.from("photo_reviews").select("*").eq("owner_id",row.owner_id);
    if(error)throw new Error("Galerie indisponible. Appliquez la migration 005 dans Supabase, puis actualisez.");
    return new Map<string,PhotoReview>((data||[]).map(r=>[r.photo_id,r]));
  }
  async function allContributions() {
    if (!client) throw new Error("Unavailable");
    const result: CloudRow[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await client.from("contributor_datasets")
        .select("*").order("owner_id").range(offset, offset + 99);
      if (error) throw error;
      const page = (data || []) as CloudRow[];
      result.push(...page);
      if (page.length < 100) return result;
    }
  }
  async function exportAll(final: boolean) {
    if (!client) return;
    await w.flush();
    const contributions = await allContributions();
    const selected = final ? contributions.filter(row => row.dataset.consent) : contributions;
    let zip = new JSZip();
    if (final) {
      const collections = [];
      const reviews=new Map<string,Review>();
      const photoReviews=new Map<string,PhotoReview>();
      for (const row of selected) {
        const validatedRow = { ...row, dataset: { ...row.dataset, photos: row.dataset.photos.filter(p => p.completed && stepValid(p, 5)) } };
        if (!validatedRow.dataset.photos.length) continue;
        const decisions=await loadPhotoReviews(row);
        const approved=await approvedDataset(await loadReviewedDataset(client,validatedRow,decisions),decisions);
        collections.push({ownerId:row.owner_id,dataset:approved});
        for(const p of approved.photos){const review=decisions.get(p.id)!;photoReviews.set(`${row.owner_id}__${p.id}`,review);}
        const regionDecisions=await loadReviews(row);
        for(const [id,review] of regionDecisions)reviews.set(`${row.owner_id}__${id}`,{...review,annotation_id:`${row.owner_id}__${id}`});
      }
      const dataset = researchDataset(collections);
      if (!dataset.photos.length) { setMessage("Aucune photo validée et autorisée à exporter."); return; }
      // IDs are namespaced only after the original snapshots and sources were verified.
      for(const p of dataset.photos){const review=photoReviews.get(p.id)!;photoReviews.set(p.id,{...review,photo_id:p.id,photo_snapshot:photoSnapshot(p),birds_snapshot:birdsSnapshot(dataset,p)});}
      zip = (await buildV1Archive(dataset,reviews,photoReviews)).zip;
    } else {
      let count = 0;
      for (const row of selected) {
        const dataset = await loadCloudDataset(client, row);
        for (const p of dataset.photos) { zip.file(`images/${row.owner_id}/${p.id}-${p.name}`, p.blob); count++; }
      }
      if (!count) { setMessage("Aucune photo à exporter."); return; }
    }
    zip.file("manifest.json", JSON.stringify({
      purpose: final ? "validated_research_dataset" : "private_collection_review",
      exported_at: new Date().toISOString(),
      collections: selected.map(row => ({ owner_id: row.owner_id, revision: row.revision, status: row.status, contributor: row.dataset.profile || null, consent: row.dataset.consent, consented_at: row.consented_at })),
    }, null, 2));
    await download(zip, final ? "guacabook-v1-research.zip" : "guacabook-originals-review.zip");
  }
  if (!admin && !w.error && !busy && !message && !error) return null;
  return (
    <section className="cloudpanel">
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
        {w.error && (
          <button disabled={busy} onClick={() => run(backup)}>
            {t("Télécharger une copie de secours")}
          </button>
        )}
      </div>
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
          <div className="cloudactions">
            <button disabled={busy} onClick={() => run(() => exportAll(true))}>{t("Exporter V1 (COCO + Wild Me)")}</button>
          </div>
          <p className="small">{t("Seules les photos validées par un vérificateur sont incluses dans le dataset.")}</p>
          <ul className="photolist">
            {rows.map((row) => (
              <li key={row.owner_id}>
                <span>
                  {row.dataset.profile || row.owner_id} ·{" "}
                  {row.dataset.photos.length} {t("photos")} ·{" "}
                  {t(row.status === "submitted" ? "Soumise" : "Brouillon")}
                </span>
                <button
                  disabled={busy}
                  onClick={() => run(() => adminExport(row))}
                >
                  {t("Exporter la contribution V1")}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {busy && <p role="status">{t("Transfert en cours…")}</p>}
      {message && <p role="status">{t(message)}</p>}
      {error && <p role="alert">{t(error)}</p>}
    </section>
  );
}

export default function CloudPanel() {
  const { t } = useI18n();
  return (
    <p className="beta-notice">
      {t("Bêta : 100 photos maximum par compte, 15 Mo par photo, JPEG / PNG / WebP.")}
    </p>
  );
}
