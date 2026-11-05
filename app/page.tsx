"use client";
import { useI18n, LanguagePicker } from "./components/I18n";
import { useEffect, useState } from "react";
import { useCloudWorkspace } from "../lib/useCloudWorkspace";
import { inheritBatchMetadata, rememberBatchMetadata } from "../lib/batchMetadata";
import {resetAnnotationFrames,showPeriocularRegion} from "../lib/annotationActions";
import BatchPhotoSelector from "./components/BatchPhotoSelector";
import RegionChecks from "./components/RegionChecks";
import { buildV1Archive } from "../lib/v1Archive";
import { readCloudRow, loadCloudDataset } from "../lib/cloud";
import exifr from "exifr";
import {
  Box,
  Dataset,
  Photo,
  nextBatchTask,
  requiredSides,
  stepValid,
  removeBird,
} from "../lib/dataset";
import AnimalForm from "./components/AnimalForm";
import { macawSpecies } from "../lib/macaws";
import ViewReference from "./components/ViewReference";
import AnnotationCanvas from "./components/AnnotationCanvas";
import BirdGlyph from "./components/BirdGlyph";
import EyeGuide from "./components/EyeGuide";
import AccountGate, { useAccount } from "./components/AccountGate";
import ResearchConsent, { RESEARCH_CONSENT_VERSION } from "./components/ResearchConsent";
import DeleteAnimalDialog from "./components/DeleteAnimalDialog";
import CloudPanel, { CloudActions } from "./components/CloudPanel";
const uid = () => crypto.randomUUID();
const stepKeys = [
  "Qualité",
  "Point de vue",
  "Corps",
  "Œil",
  "Région périoculaire",
  "Validation",
];
const titleKeys = [
  "La photo est-elle exploitable ?",
  "D’où a été prise cette photo ?",
  "L’ara est-il entièrement visible ?",
  "Voyez-vous un œil ?",
  "Délimitez la région périoculaire",
  "Vérifiez cette photo",
];
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
export default function Page() {
  return (
    <AccountGate>
      <Home />
    </AccountGate>
  );
}
function Home() {
  const { user, client, registerBeforeSignOut } = useAccount();
  const workspace = useCloudWorkspace();
  const { data, update, ready } = workspace;
  const status = !ready
    ? "Chargement de votre collection en ligne…"
    : workspace.saving
      ? "Enregistrement en ligne…"
      : workspace.dirty
        ? "Modifications en attente d’enregistrement…"
        : "Toutes les modifications sont enregistrées en ligne.";
  useEffect(
    () => registerBeforeSignOut(workspace.flush),
    [registerBeforeSignOut, workspace.flush],
  );
  const { t } = useI18n();
  const steps = stepKeys.map((key) => t(key));
  const titles = titleKeys.map((key) => t(key));
  const [logged, setLogged] = useState(false),
    [profile, setProfile] = useState(""),
    [tab, setTab] = useState("dataset"),
    [screen, setScreen] = useState<"animals" | "batch" | "annotate">("animals"),
    [bird, setBird] = useState(""),
    [active, setActive] = useState(""),
    [session, setSession] = useState(""),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState(""),
    [side, setSide] = useState<Box["side"]>("unknown"),
    [message, setMessage] = useState("");
  const [pausing,setPausing]=useState(false);
  const [pauseError,setPauseError]=useState(false);
  const [failedFiles, setFailedFiles] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [deletingBird, setDeletingBird] = useState<{ id: string; name: string; count: number } | null>(null);

  const photo = data.photos.find((p) => p.id === active);
  const batchKey = photo
    ? photo.batchId || `${photo.birdId || bird}:${photo.sessionId}`
    : "";
  const step = photo
    ? (data.batchStages?.[batchKey] ?? photo.workflowStep ?? 0)
    : 0;
  function setStage(value: number) {
    if(pausing)return;
    update((d) => ({
      ...d,
      batchStages: { ...d.batchStages, [batchKey]: value },
    }));
  }
  const selected = data.birds.find((b) => b.id === bird);
  const photos = data.photos.filter((p) =>
    bird
      ? p.birdId === bird ||
        (!p.birdId && p.boxes.some((b) => b.birdId === bird))
      : !p.birdId,
  );
  const batch = photo
    ? photos.filter((p) =>
        photo.batchId
          ? p.batchId === photo.batchId
          : p.sessionId === photo.sessionId,
      )
    : [];
  useEffect(() => {
    if (!ready) return;
    setConsentConfirmed(data.consent && data.researchConsent?.version === RESEARCH_CONSENT_VERSION);
    setProfile(data.profile);
    setLogged(!!data.profile);
    setBird(data.birds[0]?.id || "");
    setActive("");
    setScreen("animals");
  }, [ready]);
  useEffect(() => {
    if (!photo) {
      setUrl("");
      return;
    }
    const u = URL.createObjectURL(photo.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo?.id, photo?.blob]);
  useEffect(() => {
    setMessage("");
    setSide(photo ? requiredSides(photo)[0] : "unknown");
  }, [active, step]);
  function patchPhoto(patch: Partial<Photo>) {
    if (pausing || !photo) return;
    update(d => {
      const updated = {
        ...d,
        photos: d.photos.map(p => p.id === photo.id ? {
          ...p, completed: false, annotationVersion: 1 as const,
          doneSteps: (p.doneSteps || (p.completed ? [0,1,2,3,4,5] : [])).filter(s => s !== step && s !== 5),
          ...patch,
        } : p),
      };
      return patch.capturedAt !== undefined || patch.sessionId !== undefined
        ? rememberBatchMetadata(updated, updated.photos.find(p => p.id === photo.id)!)
        : updated;
    });
  }
  function choose(id: string) {
    setBird(id);
    setScreen("batch");
  }
  async function importPhotos(files: FileList | null) {
    if (!files || !bird) return;
    setBusy(true);
    setMessage("");
    const imported: Photo[] = [],
      failed: string[] = [];
    const batchId = uid();
    try {
      for (const file of Array.from(files)) {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 15 * 1024 * 1024 ||
          data.photos.length + imported.length >= 100
        ) {
          failed.push(file.name);
          continue;
        }
        try {
          const bitmap = await createImageBitmap(file, {
            imageOrientation: "from-image",
          });
          let capturedAt = "";
          try {
            const meta = await exifr.parse(file, {
              pick: ["DateTimeOriginal"],
            });
            if (meta?.DateTimeOriginal instanceof Date)
              capturedAt = localDate(meta.DateTimeOriginal);
          } catch {}
          imported.push({
            id: uid(),
            name: file.name.replace(/[^\p{L}\p{N}._-]/gu, "_"),
            blob: file,
            width: bitmap.width,
            height: bitmap.height,
            capturedAt,
            metadataOrigin: { ...(capturedAt ? { capturedAt: "exif" as const } : {}), ...(session.trim() ? { sessionId: "manual" as const } : {}) },
            sessionId: session.trim(),
            birdId: bird,
            batchId,
            quality: "unreviewed",
            workflowStep: 0,
            annotationVersion: 1,
            boxes: [],
          });
          bitmap.close();
        } catch {
          failed.push(file.name);
        }
      }
      update((d) => ({ ...d, photos: [...d.photos, ...imported] }));
      if (imported.length) {
        setActive(imported[0].id);
        setScreen("annotate");
      }
      if (failed.length)
        setMessage(
          "Fichiers refusés : {files}. Utilisez JPEG, PNG ou WebP, 15 Mo maximum par photo et 100 photos par collection.",
        );
      setFailedFiles(failed.join(", "));
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    try {
      await workspace.flush();
      if(!client || !user)throw new Error("Authentication required");
      const row=await readCloudRow(client,user.id);
      if(!row)throw new Error("Collection missing");
      const snapshot=await loadCloudDataset(client,row);
      const {data:reviews,error}=await client.from("annotation_reviews").select("*").eq("owner_id",user.id).eq("dataset_revision",row.revision);
      const {zip}=await buildV1Archive(snapshot,new Map((reviews||[]).map(r=>[r.annotation_id,r])));
      zip.file("manifest.json",JSON.stringify({owner_id:user.id,revision:row.revision,contributor:snapshot.profile},null,2));
      if(error)zip.file("review-unavailable.txt","Apply Supabase migration 004 to enable verified Wild Me samples. Generic dataset only.");
      const blob = await zip.generateAsync({ type: "blob" });
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = "guacabook-dataset.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 30000);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Échec de l’export");
    } finally {
      setBusy(false);
    }
  }
  const category: Box["category"] | undefined =
    step === 2
      ? "macaw"
      : step === 3
        ? "eye"
        : step === 4
          ? "periocular_region"
          : undefined;
  const canDraw =
    !!photo &&
    !!category &&
    (step === 2
      ? ["full", "partial"].includes(photo.bodyVisibility || "")
      : step === 3
        ? photo.eyeVisible === "yes" && !!photo.eyeLayout
        : photo.eyeVisible === "yes" && !!photo.eyeLayout);
  function answer(patch: Partial<Photo>, remove: Box["category"][] = []) {
    if (!photo) return;
    patchPhoto({
      ...patch,
      boxes: (patch.boxes ?? photo.boxes).filter(
        (b) =>
          b.birdId !== (photo.birdId || "") || !remove.includes(b.category),
      ),
    });
  }
  function openPhoto(p: Photo) {
    if(pausing)return;
    setPauseError(false);
    update(d => {
      let assigned = !p.birdId && bird ? {
        ...d, photos: d.photos.map(x => x.id === p.id ? { ...x, birdId: bird } : x),
      } : d;
      if (photo && step === 0) assigned = rememberBatchMetadata(assigned, photo);
      return inheritBatchMetadata(assigned, p.id);
    });
    setActive(p.id);
    if (p.birdId) setBird(p.birdId);
    setScreen("annotate");
  }
  function advance() {
    if (pausing || !photo) return;
    if (!stepValid(photo, step)) {
      setMessage(
        "Répondez à la question et tracez la zone demandée avant de continuer.",
      );
      return;
    }
    const changed = {
      ...photo,
      doneSteps: [
        ...new Set([
          ...(photo.doneSteps || (photo.completed ? [0, 1, 2, 3, 4, 5] : [])),
          step,
        ]),
      ],
      completed: step === 5,
    };
    const currentBatch = batch.map((p) => (p.id === photo.id ? changed : p));
    const next = nextBatchTask(currentBatch, photo.id, step);
    update(d => {
      let updated: Dataset = {
        ...d,
        photos: d.photos.map(p => p.id === photo.id ? changed : p),
        batchStages: { ...d.batchStages, [batchKey]: next?.step ?? 5 },
        annotationResume: d.annotationResume && batch.some(p=>p.id===d.annotationResume!.photoId)
          ? (next?{photoId:next.id,step:next.step}:undefined) : d.annotationResume,
      };
      if (step === 0) updated = rememberBatchMetadata(updated, changed);
      return next ? inheritBatchMetadata(updated, next.id) : updated;
    });
    if (next) setActive(next.id);
    else {
      setScreen("batch");
      setMessage("Lot terminé. Toutes les étapes sont validées pour le lot.");
    }
  }
  async function pauseAnnotation() {
    if(!photo || pausing)return;
    setPausing(true);setPauseError(false);
    update(d=>({...d,annotationResume:{photoId:photo.id,step}}));
    try{await workspace.flush();setScreen("batch");}
    catch{setPauseError(true);}
    finally{setPausing(false);}
  }
  const resumePhoto=data.photos.find(p=>p.id===data.annotationResume?.photoId);
  function resumeAnnotation() {
    const cursor=data.annotationResume;
    if(!cursor || !resumePhoto || pausing)return;
    openPhoto(resumePhoto);
    const key=resumePhoto.batchId || `${resumePhoto.birdId||bird}:${resumePhoto.sessionId}`;
    update(d=>({...d,batchStages:{...d.batchStages,[key]:Math.max(0,Math.min(5,cursor.step))}}));
  }
  const boxList =
    photo?.boxes.filter((b) => !category || b.category === category) || [];
  if (!ready)
    return (
      <main>
        <LanguagePicker />
        {ready && user && <CloudPanel />}
        <h1>GuacaBook</h1>
        <p role="status">{t(status)}</p>
        {workspace.error && (
          <>
            <p role="alert">{t(workspace.error)}</p>
            <button onClick={() => void workspace.reload()}>
              {t("Réessayer le chargement")}
            </button>
          </>
        )}
      </main>
    );
  if (!consentConfirmed) return <ResearchConsent workspace={workspace} onAccepted={() => setConsentConfirmed(true)} />;
  if (!logged)
    return (
      <main className="login">
        <LanguagePicker />
        {ready && user && <CloudPanel />}
        <div className="brand">◉ GuacaBook</div>
        <section>
          <span className="eyebrow">{t("BIENVENUE DANS VOTRE CARNET")}</span>
          <h1>
            {" "}
            {t("Un regard.")} <br /> {t("Une identité.")}{" "}
          </h1>
          <p>
            {" "}
            {t(
              "Créez la collection photographique de vos aras, une photo après l’autre.",
            )}{" "}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!profile.trim()) return;
              update((d) => ({ ...d, profile: profile.trim() }));
              setLogged(true);
            }}
          >
            <label>
              {" "}
              {t("Nom ou pseudonyme")}{" "}
              <input
                autoComplete="nickname"
                required
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                placeholder={t("Comment vous appeler ?")}
              />
            </label>
            <button className="primary" type="submit">
              {" "}
              {t("Entrer dans GuacaBook →")}{" "}
            </button>
          </form>
          <p className="small">
            {" "}
            {t(
              "Choisissez un pseudonyme pour votre compte. Vos animaux et annotations seront sauvegardés automatiquement en ligne.",
            )}{" "}
          </p>
        </section>
      </main>
    );
  return (
    <main>
      <LanguagePicker />
      {ready && user && <CloudPanel />}
      <header>
        <div className="brand">◉ GuacaBook</div>
        <button
          onClick={() => setLogged(false)}
          aria-label={t("Modifier mon profil")}
        >
          {data.profile} {t("· Mon profil")}{" "}
        </button>
      </header>
      <nav className="tabs" aria-label={t("Sections")}>
        {[
          ["dataset", t("Dataset")],
          ["identification", t("Identification")],
          ["twin", t("Jumeau numérique")],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            {label}
            {id !== "dataset" && <small>{t("À venir")}</small>}
          </button>
        ))}
      </nav>
      {tab !== "dataset" ? (
        <section className="placeholder">
          <span className="eyebrow">{t("PROCHAINEMENT")}</span>
          <h1>
            {tab === "twin" ? t("Jumeau numérique") : t("Identification")}
          </h1>
          <p>
            {tab === "twin"
              ? t("Un espace dédié à la représentation de votre animal.")
              : t("Un espace dédié à l’identification des animaux.")}{" "}
            {t("Ce module n’est pas encore disponible.")}{" "}
          </p>
          <button onClick={() => setTab("dataset")}>
            {t("Revenir au dataset")}
          </button>
        </section>
      ) : (
        <>
          <div className="pagehead">
            <div>
              <span className="eyebrow">
                {t("VOTRE COLLECTION SCIENTIFIQUE")}
              </span>
              <h1>
                {screen === "animals"
                  ? t("Commençons par vos aras.")
                  : screen === "batch"
                    ? t("Les photos de {name}.", {
                        name: selected?.name || t("votre ara"),
                      })
                    : t("Une tâche, tout le lot.")}
              </h1>
              <p>
                {screen === "animals"
                  ? t(
                      "Créez vos animaux, puis choisissez celui que vous souhaitez photographier.",
                    )
                  : screen === "batch"
                    ? t(
                        "Déposez un lot pour cet animal. Vous réaliserez la même tâche sur toutes les photos avant de passer à la suivante.",
                      )
                    : t(
                        "Une tâche à la fois : terminez cette étape sur tout le lot avant de changer de tâche.",
                      )}
              </p>
            </div>
            {screen !== "animals" && (
              <button onClick={() => setScreen("animals")}>
                {" "}
                {t("← Mes animaux")}{" "}
              </button>
            )}
          </div>
          {message && (
            <p role="alert" className="notice">
              {t(message, { files: failedFiles })}
            </p>
          )}
          {screen!=="annotate"&&resumePhoto&&<div className="resume-annotation">
            <p>{t("Travail enregistré : {name} · {step}",{name:resumePhoto.name,step:steps[data.annotationResume!.step]||steps[0]})}</p>
            <button className="primary" onClick={resumeAnnotation}>{t("Reprendre le travail enregistré")}</button>
          </div>}
          {screen === "animals" && (
            <div className="animalgrid">
              {data.birds.map((b) => (
                <section className="animal" key={b.id}>
                  <span className="avatar">↗</span>
                  <h2>{b.name || t("Ara sans nom")}</h2>
                  <p>{b.speciesInfo?.kind === "hybrid"
                    ? `${t("Hybride")}${b.speciesInfo.label ? ` · ${b.speciesInfo.label}` : ""}`
                    : macawSpecies.some(([scientificName]) => scientificName === b.species)
                      ? `${t(macawSpecies.find(([scientificName]) => scientificName === b.species)![1])} · ${b.species}`
                      : b.species || t("Espèce inconnue")}</p>
                  <p className="small">
                    {t(b.sex === "male" ? "Mâle" : b.sex === "female" ? "Femelle" : "Sexe inconnu")}
                    {" · "}{b.birthYear ? t("Naissance : {year} · environ {age} an(s)", { year: b.birthYear, age: new Date().getFullYear() - b.birthYear }) : t("Année de naissance inconnue")}
                  </p>
                  <p className="small">
                    {
                      data.photos.filter(
                        (p) =>
                          p.birdId === b.id ||
                          p.boxes.some((x) => x.birdId === b.id),
                      ).length
                    }{" "}
                    {t("photo(s) · Identifiant")} {b.id.slice(0, 8)}
                  </p>
                  <button className="primary" onClick={() => choose(b.id)}>
                    {" "}
                    {t("Choisir cet animal →")}{" "}
                  </button>
                  <button className="delete-animal" onClick={() => setDeletingBird({
                    id: b.id, name: b.name || t("Ara sans nom"),
                    count: data.photos.filter(p => p.birdId === b.id || p.boxes.some(box => box.birdId === b.id)).length,
                  })}>
                    {t("Supprimer cet animal")}
                  </button>
                </section>
              ))}
              <AnimalForm onCreate={b => {
                update(d => ({ ...d, birds: [...d.birds, b] }));
                choose(b.id);
              }} />
            </div>
          )}
          {screen === "batch" && (
            <>
              <div className="batchgrid">
                <section>
                  <h2>{t("1. Déposer un lot")}</h2>
                  <p>
                    {" "}
                    {t("Animal sélectionné :")}{" "}
                    <strong>{selected?.name || t("Ara sans nom")}</strong>
                  </p>
                  <label>
                    {" "}
                    {t("Séance de prise de vue")}{" "}
                    <input
                      value={session}
                      onChange={(e) => setSession(e.target.value)}
                      placeholder={t("Ex. Jardin — matin du 2 novembre")}
                    />
                  </label>
                  <label className="upload">
                    {" "}
                    {t("+ Choisir les photos du lot")}{" "}
                    <input
                      aria-label={t("Photos du lot")}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      disabled={busy || !bird}
                      onChange={(e) => {
                        void importPhotos(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <p className="small">
                    {" "}
                    {t(
                      "JPEG, PNG et formats décodables par votre navigateur. Choisissez une séance cohérente. Chaque import constitue un lot distinct.",
                    )}{" "}
                  </p>
                </section>
                <section>
                  <h2>{t("2. Une même tâche sur tout le lot")}</h2>
                  <ol>
                    {steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  <p className="small">
                    {" "}
                    {t(
                      "Collectez les deux côtés, à différentes dates et heures. La fiabilité de l’identification reste à évaluer.",
                    )}{" "}
                  </p>
                </section>
              </div>
              <section className="collection">
                <h2>
                  {" "}
                  {t("Collection ·")} {photos.filter((p) => p.completed).length}
                  /{photos.length} {t("photos validées")}{" "}
                </h2>
                <div className="coverage">
                  {(["left", "right"] as const).map((side) => (
                    <span key={side}>
                      {side === "left" ? t("Gauche") : t("Droite")} :{" "}
                      {
                        photos.filter((p) =>
                          p.boxes.some(
                            (b) =>
                              b.category === "periocular_region" &&
                              b.birdId === bird &&
                              b.side === side,
                          ),
                        ).length
                      }{" "}
                      {t("photo(s) ·")}{" "}
                      {
                        new Set(
                          photos
                            .filter((p) =>
                              p.boxes.some(
                                (b) =>
                                  b.category === "periocular_region" &&
                                  b.birdId === bird &&
                                  b.side === side,
                              ),
                            )
                            .map((p) => p.sessionId)
                            .filter(Boolean),
                        ).size
                      }{" "}
                      {t("séance(s)")}{" "}
                    </span>
                  ))}
                </div>
                {!photos.length ? (
                  <p>{t("Aucune photo pour le moment.")}</p>
                ) : (
                  <ul className="photolist">
                    {photos.map((p) => (
                      <li key={p.id}>
                        <div>
                          <strong>{p.name}</strong>
                          <p className="small">
                            {p.sessionId || t("Séance non renseignée")} ·{" "}
                            {p.completed
                              ? t("Validée")
                              : t("Brouillon · {step}", {
                                  step: steps[
                                    data.batchStages?.[
                                      p.batchId ||
                                        `${p.birdId || bird}:${p.sessionId}`
                                    ] ??
                                      p.workflowStep ??
                                      0
                                  ],
                                })}
                          </p>
                        </div>
                        <button onClick={() => openPhoto(p)}>
                          {" "}
                          {t("Reprendre →")}{" "}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
          {screen === "annotate" && photo && (
            <>
              <div className="lotbar">
                <button disabled={pausing} onClick={() => setScreen("batch")}>
                  {" "}
                  {t("← Retour au lot")}{" "}
                </button>
                <span>
                  {selected?.name || t("Ara")} {t("· Photo")}{" "}
                  {batch.findIndex((p) => p.id === photo.id) + 1}/{batch.length}{" "}
                  · {photo.name}
                </span>
              </div>
              <nav className="steps" aria-label={t("Étapes d’annotation")}>
                {steps.map((label, i) => (
                  <button
                    key={label}
                    aria-current={step === i ? "step" : undefined}
                    disabled={pausing}
                    onClick={() => setStage(i)}
                  >
                    <span>{i + 1}</span>
                    {label}
                  </button>
                ))}
              </nav>
              <div className="annotationgrid">
                <section className="imagepanel">
                  <div className="sectionhead">
                    <strong>{photo.name}</strong>
                    <span>
                      {photo.width} × {photo.height}
                    </span>
                  </div>
                  <BatchPhotoSelector photos={batch} active={photo.id} step={step} disabled={pausing} onSelect={openPhoto}/>
                  <AnnotationCanvas
                    key={photo.id}
                    photo={photo}
                    url={url}
                    category={category}
                    side={side}
                    canDraw={canDraw && !pausing}
                    onResize={(id,bbox)=>{
                      const target=photo.boxes.find(box=>box.id===id);
                      patchPhoto({boxes:photo.boxes.map(box=>box.id===id?{...box,bbox}:box),...(target?.category==="periocular_region"?showPeriocularRegion(photo,target.side):{})});
                    }}
                    onReset={() => {
                      if (category) patchPhoto(resetAnnotationFrames(photo,category));
                    }}
                    onAdd={(bbox) => {
                      if (!category) return;
                      patchPhoto({
                        ...(category==="periocular_region"?showPeriocularRegion(photo,side):{}),
                        boxes: [
                          ...photo.boxes,
                          {
                            id: uid(),
                            category,
                            birdId: photo.birdId || "",
                            side: category === "macaw" ? "unknown" : side,
                            bbox,
                            ...(category === "periocular_region" ? { usability: "unknown" as const, occluded: null } : {}),
                          },
                        ],
                      });
                    }}
                  />
                  {boxList.length > 0 && (
                    <ul className="annotations">
                      {boxList.map((b, i) => (
                        <li key={b.id}>
                          <span>
                            {i + 1}.{" "}
                            {b.category === "macaw"
                              ? t("Corps")
                              : b.category === "eye"
                                ? t("Œil")
                                : t("Région périoculaire")}
                            {b.category !== "macaw"
                              ? ` · ${b.side === "left" ? t("gauche") : b.side === "right" ? t("droite") : t("côté inconnu")}`
                              : ""}
                          </span>
                          {b.category === "periocular_region" && <RegionChecks box={b} index={i+1} onChange={patch=>patchPhoto({boxes:photo.boxes.map(box=>box.id===b.id?{...box,...patch}:box)})}/>}
                          <button
                            aria-label={t("Supprimer l’annotation {number}", {
                              number: i + 1,
                            })}
                            onClick={() =>
                              patchPhoto({
                                boxes: photo.boxes.filter((x) => x.id !== b.id),
                              })
                            }
                          >
                            {" "}
                            {t("Supprimer")}{" "}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section className="question">
                  <fieldset disabled={pausing} className="annotation-form-fields">
                  <span className="eyebrow">
                    {" "}
                    {t("ÉTAPE")} {step + 1} / 6 ·{" "}
                    {
                      batch.filter(
                        (p) =>
                          (p.doneSteps?.includes(step) || p.completed) &&
                          stepValid(p, step),
                      ).length
                    }
                    /{batch.length} {t("PHOTOS TRAITÉES")}{" "}
                  </span>
                  <h2>{titles[step]}</h2>
                  {step === 0 && (
                    <>
                      <p>
                        {" "}
                        {t(
                          "Vérifiez la netteté des détails. Une photo floue peut être conservée, mais signalez-la.",
                        )}{" "}
                      </p>
                      <div className="choices">
                        {[
                          ["usable", t("Nette / exploitable")],
                          ["blurry", t("Floue / à refaire")],
                        ].map(([v, l]) => (
                          <button
                            key={v}
                            aria-pressed={photo.quality === v}
                            onClick={() =>
                              patchPhoto({ quality: v as Photo["quality"] })
                            }
                          >
                            <BirdGlyph
                              view="front"
                              variant={
                                v === "blurry"
                                  ? "blurred"
                                  : v === "partial"
                                    ? "partial"
                                    : v === "not_visible"
                                      ? "hidden"
                                      : v === "unknown"
                                        ? "unknown"
                                        : undefined
                              }
                            />
                            <span>{l}</span>
                          </button>
                        ))}
                      </div>
                      <label>
                        {" "}
                        {t("Date et heure (sans fuseau)")}{" "}
                        <input
                          type="datetime-local"
                          step="1"
                          value={photo.capturedAt}
                          onChange={(e) =>
                            patchPhoto({ capturedAt: e.target.value, metadataOrigin: { ...photo.metadataOrigin, capturedAt: "manual" } })
                          }
                        />
                      </label>
                      <p className="small">
                        {" "}
                        {t(
                          "Date EXIF si disponible. Laissez vide si inconnue.",
                        )}{" "}
                      </p>
                      <label>
                        {" "}
                        {t("Séance")}{" "}
                        <input
                          value={photo.sessionId}
                          onChange={(e) =>
                            patchPhoto({ sessionId: e.target.value, metadataOrigin: { ...photo.metadataOrigin, sessionId: "manual" } })
                          }
                        />
                      </label>
                    </>
                  )}
                  {step === 0 && (photo.metadataOrigin?.capturedAt === "batch" || photo.metadataOrigin?.sessionId === "batch") && <p className="small">{t("Date ou séance reprise de la photo précédente du lot. Vérifiez ces informations pour cette photo.")}</p>}
                  {step === 1 && (
                    <ViewReference
                      value={photo.viewpoint}
                      onChange={(viewpoint) => patchPhoto({ viewpoint })}
                    />
                  )}
                  {step === 2 && (
                    <>
                      <p>
                        {" "}
                        {t(
                          "Indiquez si l’animal est complet, puis encadrez tout le corps visible, queue comprise si elle apparaît.",
                        )}{" "}
                      </p>
                      <div className="choices">
                        {[
                          ["full", t("Oui, l’ara est entier")],
                          ["partial", t("Non, une partie est hors cadre")],
                          ["not_visible", t("Le corps n’est pas visible")],
                          ["unknown", t("Je ne sais pas")],
                        ].map(([v, l]) => (
                          <button
                            key={v}
                            aria-pressed={photo.bodyVisibility === v}
                            onClick={() =>
                              answer(
                                {
                                  bodyVisibility: v as Photo["bodyVisibility"],
                                },
                                ["not_visible", "unknown"].includes(v)
                                  ? ["macaw"]
                                  : [],
                              )
                            }
                          >
                            <BirdGlyph
                              view="front"
                              variant={
                                v === "blurry"
                                  ? "blurred"
                                  : v === "partial"
                                    ? "partial"
                                    : v === "not_visible"
                                      ? "hidden"
                                      : v === "unknown"
                                        ? "unknown"
                                        : undefined
                              }
                            />
                            <span>{l}</span>
                          </button>
                        ))}
                      </div>
                      {canDraw && (
                        <p className="drawhint">
                          {" "}
                          {t(
                            "Tracez maintenant la boîte du corps visible sur la photo.",
                          )}{" "}
                        </p>
                      )}
                    </>
                  )}
                  {(step === 3 || step === 4) && (
                    <EyeGuide
                      photo={photo}
                      step={step}
                      side={side}
                      setSide={setSide}
                      onChange={answer}
                    />
                  )}
                  {step === 5 && (
                    <>
                      <p>
                        {" "}
                        {t(
                          "Validez cette photo, puis la suivante du lot. Chaque étape a été réalisée en série sur toutes les photos.",
                        )}{" "}
                      </p>
                      <p className="small">{t("Terminer l’annotation ne vaut pas acceptation scientifique. Une personne autorisée examinera les régions avant leur export Wild Me.")}</p>
                      <ul className="review">
                        {steps.slice(0, 5).map((s, i) => (
                          <li key={s}>
                            <span>{s}</span>
                            <button onClick={() => setStage(i)}>
                              {stepValid(photo, i)
                                ? t("✓ Vérifier")
                                : t("À compléter →")}
                            </button>
                          </li>
                        ))}
                      </ul>
                      <p className="small">
                        {" "}
                        {t(
                          "Le point de vue et la latéralité sont des déclarations du contributeur. Aucune information inconnue n’est déduite.",
                        )}{" "}
                      </p>
                    </>
                  )}
                  <div className="stepactions annotation-actions">
                    <button disabled={pausing || step===0} onClick={()=>setStage(step-1)}>{t("Étape précédente")}</button>
                    <button disabled={pausing || step===5} onClick={()=>setStage(step+1)}>{t("Étape suivante")}</button>
                    <button className="primary" disabled={pausing || !stepValid(photo,step)} onClick={advance}>
                      {t(step===5?"Valider cette photo →":"Valider et continuer →")}
                    </button>
                  </div>
                  <p className="small">{t("Valider passe à la prochaine photo à traiter dans cette étape, puis à l’étape suivante en fin de lot.")}</p>
                  <button className="quiet" disabled={pausing} onClick={()=>void pauseAnnotation()}>
                    {t(pausing?"Enregistrement en ligne…":"Enregistrer et reprendre plus tard")}
                  </button>
                  {pauseError&&<p role="alert">{t("La sauvegarde a échoué. Restez sur cette page et réessayez avant de quitter.")}</p>}
                  </fieldset>
                </section>
              </div>
            </>
          )}
          {data.photos.some((p) => !p.birdId) && (
            <details className="legacy">
              <summary>
                {" "}
                {t("Photos sans animal associé")}{" "}
              </summary>
              <p>
                {" "}
                {t(
                  "Choisissez un animal pour associer ces photos et reprendre l’annotation.",
                )}{" "}
              </p>
              {data.photos
                .filter((p) => !p.birdId)
                .map((p) => (
                  <div key={p.id} className="legacyrow">
                    <span>{p.name}</span>
                    <button
                      disabled={!bird}
                      onClick={() => {
                        update((d) => ({
                          ...d,
                          photos: d.photos.map((x) =>
                            x.id === p.id ? { ...x, birdId: bird } : x,
                          ),
                        }));
                        setActive(p.id);
                        setScreen("annotate");
                      }}
                    >
                      {" "}
                      {t("Associer à l’animal sélectionné")}{" "}
                    </button>
                  </div>
                ))}
            </details>
          )}
          <footer>
            <details className="personal-export">
              <summary>{t("Exporter mes données")}</summary>
              <button
                className="primary"
                disabled={!data.consent || !data.photos.length || busy}
                onClick={() => void download()}
              >
                {busy ? t("Traitement…") : t("Exporter le dataset ↗")}
              </button>
            </details>
          </footer>
          <CloudActions workspace={workspace} />
        </>
      )}
      {deletingBird && <DeleteAnimalDialog
        name={deletingBird.name} count={deletingBird.count}
        onCancel={() => setDeletingBird(null)}
        onDelete={async () => {
          update(d => removeBird(d, deletingBird.id));
          await workspace.flush();
          if (bird === deletingBird.id) { setBird(""); setActive(""); setScreen("animals"); }
          setDeletingBird(null);
        }}
      />}
      <p className="savestatus" role="status">
        {t(status)}
      </p>
    </main>
  );
}
