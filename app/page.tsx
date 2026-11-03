"use client";
import { useEffect, useRef, useState } from "react";
import { get, set } from "idb-keyval";
import exifr from "exifr";
import JSZip from "jszip";
import {
  Box,
  Dataset,
  Photo,
  coco,
  emptyDataset,
  nextBatchTask,
  requiredSides,
  stepValid,
} from "../lib/dataset";
import ViewReference from "./components/ViewReference";
import AnnotationCanvas from "./components/AnnotationCanvas";
import BirdGlyph from "./components/BirdGlyph";
import EyeGuide from "./components/EyeGuide";
const uid = () => crypto.randomUUID();
const steps = [
  "Qualité",
  "Point de vue",
  "Corps",
  "Œil",
  "Région périoculaire",
  "Validation",
];
const titles = [
  "La photo est-elle exploitable ?",
  "D’où a été prise cette photo ?",
  "L’ara est-il entièrement visible ?",
  "Voyez-vous un œil ?",
  "Délimitez la région périoculaire",
  "Vérifiez cette photo",
];
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
export default function Home() {
  const [data, update] = useState<Dataset>(emptyDataset),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState("Chargement du brouillon…"),
    [logged, setLogged] = useState(false),
    [profile, setProfile] = useState(""),
    [tab, setTab] = useState("dataset"),
    [screen, setScreen] = useState<"animals" | "batch" | "annotate">("animals"),
    [bird, setBird] = useState(""),
    [active, setActive] = useState(""),
    [name, setName] = useState(""),
    [species, setSpecies] = useState(""),
    [session, setSession] = useState(""),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState(""),
    [side, setSide] = useState<Box["side"]>("unknown"),
    [message, setMessage] = useState("");
  const queue = useRef(Promise.resolve());
  const photo = data.photos.find((p) => p.id === active);
  const batchKey = photo
    ? photo.batchId || `${photo.birdId || bird}:${photo.sessionId}`
    : "";
  const step = photo
    ? (data.batchStages?.[batchKey] ?? photo.workflowStep ?? 0)
    : 0;
  function setStage(value: number) {
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
    get<Dataset>("guacabook-v1")
      .then((d) => {
        if (d) {
          update(d);
          setProfile(d.profile);
          setLogged(!!d.profile);
          setBird(d.birds[0]?.id || "");
        }
        setReady(true);
      })
      .catch(() =>
        setStatus(
          "Stockage local inaccessible. Vérifiez les permissions du navigateur.",
        ),
      );
  }, []);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    setStatus("Enregistrement…");
    queue.current = queue.current
      .catch(() => {})
      .then(() => set("guacabook-v1", data));
    queue.current
      .then(() => {
        if (live) setStatus("Brouillon enregistré sur cet appareil");
      })
      .catch(() => {
        if (live)
          setStatus(
            "Échec de sauvegarde. Exportez vos données : stockage plein ou indisponible.",
          );
      });
    return () => {
      live = false;
    };
  }, [data, ready]);
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
    if (photo)
      update((d) => ({
        ...d,
        photos: d.photos.map((p) =>
          p.id === photo.id
            ? {
                ...p,
                completed: false,
                doneSteps: (
                  p.doneSteps || (p.completed ? [0, 1, 2, 3, 4, 5] : [])
                ).filter((s) => s !== step && s !== 5),
                ...patch,
              }
            : p,
        ),
      }));
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
            sessionId: session.trim(),
            birdId: bird,
            batchId,
            quality: "unreviewed",
            workflowStep: 0,
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
          `Fichiers non pris en charge : ${failed.join(", ")}. Convertissez les HEIC/RAW en JPEG ou PNG.`,
        );
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    try {
      const zip = new JSZip();
      zip.file("annotations.json", JSON.stringify(coco(data), null, 2));
      zip.file(
        "README.txt",
        "GuacaBook v2 — CC BY 4.0\nLes originaux peuvent contenir des métadonnées privées. Coordonnées après orientation EXIF. Catégories : macaw (1), periocular_region (2), eye (3). images[].guacabook contient individual_id, batch_id, viewpoint (azimuth: avant 0°, droite 90°, dos 180°, gauche 270°; elevation: dessus +30°, hauteur 0°, dessous -30°), body_visibility, eye_visible, periocular_visible et annotation_status. Point de vue null = inconnu/non renseigné. Consultez README.md du projet. Aucun recadrage généré.",
      );
      for (const p of data.photos) zip.file(`images/${p.id}-${p.name}`, p.blob);
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
        : photo.eyeVisible === "yes" &&
          (photo.regionBySide?.[side] ??
            (photo.eyeLayout === "both" ? undefined : photo.regionVisible)) ===
            "yes");
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
    if (!p.birdId && bird)
      update((d) => ({
        ...d,
        photos: d.photos.map((x) =>
          x.id === p.id ? { ...x, birdId: bird } : x,
        ),
      }));
    setActive(p.id);
    if (p.birdId) setBird(p.birdId);
    setScreen("annotate");
  }
  function advance() {
    if (!photo) return;
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
    update((d) => ({
      ...d,
      photos: d.photos.map((p) => (p.id === photo.id ? changed : p)),
      batchStages: { ...d.batchStages, [batchKey]: next?.step ?? 5 },
    }));
    if (next) setActive(next.id);
    else {
      setScreen("batch");
      setMessage("Lot terminé. Toutes les étapes sont validées pour le lot.");
    }
  }
  const boxList =
    photo?.boxes.filter((b) => !category || b.category === category) || [];
  if (!ready)
    return (
      <main>
        <h1>GuacaBook</h1>
        <p role="status">{status}</p>
      </main>
    );
  if (!logged)
    return (
      <main className="login">
        <div className="brand">◉ GuacaBook</div>
        <section>
          <span className="eyebrow">BIENVENUE DANS VOTRE CARNET</span>
          <h1>
            Un regard.
            <br />
            Une identité.
          </h1>
          <p>
            Créez la collection photographique de vos aras, une photo après
            l’autre.
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
              Nom ou pseudonyme
              <input
                autoComplete="nickname"
                required
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                placeholder="Comment vous appeler ?"
              />
            </label>
            <button className="primary" type="submit">
              Entrer dans GuacaBook →
            </button>
          </form>
          <p className="small">
            Profil local mémorisé sur cet appareil. Il ne s’agit pas d’un compte
            sécurisé. Photos et brouillons restent dans ce navigateur.
          </p>
        </section>
      </main>
    );
  return (
    <main>
      <header>
        <div className="brand">◉ GuacaBook</div>
        <button
          onClick={() => setLogged(false)}
          aria-label="Modifier mon profil"
        >
          {data.profile} · Mon profil
        </button>
      </header>
      <nav className="tabs" aria-label="Sections">
        {[
          ["dataset", "Dataset"],
          ["identification", "Identification"],
          ["twin", "Jumeau numérique"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            {label}
            {id !== "dataset" && <small>À venir</small>}
          </button>
        ))}
      </nav>
      {tab !== "dataset" ? (
        <section className="placeholder">
          <span className="eyebrow">PROCHAINEMENT</span>
          <h1>{tab === "twin" ? "Jumeau numérique" : "Identification"}</h1>
          <p>
            {tab === "twin"
              ? "Un espace dédié à la représentation de votre animal."
              : "Un espace dédié à l’identification des animaux."}{" "}
            Ce module n’est pas encore disponible.
          </p>
          <button onClick={() => setTab("dataset")}>Revenir au dataset</button>
        </section>
      ) : (
        <>
          <div className="pagehead">
            <div>
              <span className="eyebrow">VOTRE COLLECTION SCIENTIFIQUE</span>
              <h1>
                {screen === "animals"
                  ? "Commençons par vos aras."
                  : screen === "batch"
                    ? `Les photos de ${selected?.name || "votre ara"}.`
                    : "Une tâche, tout le lot."}
              </h1>
              <p>
                {screen === "animals"
                  ? "Créez vos animaux, puis choisissez celui que vous souhaitez photographier."
                  : screen === "batch"
                    ? "Déposez un lot pour cet animal. Vous réaliserez la même tâche sur toutes les photos avant de passer à la suivante."
                    : "Une tâche à la fois : terminez cette étape sur tout le lot avant de changer de tâche."}
              </p>
            </div>
            {screen !== "animals" && (
              <button onClick={() => setScreen("animals")}>
                ← Mes animaux
              </button>
            )}
          </div>
          {message && (
            <p role="alert" className="notice">
              {message}
            </p>
          )}
          {screen === "animals" && (
            <div className="animalgrid">
              {data.birds.map((b) => (
                <section className="animal" key={b.id}>
                  <span className="avatar">↗</span>
                  <h2>{b.name || "Ara sans nom"}</h2>
                  <p>{b.species || "Espèce inconnue"}</p>
                  <p className="small">
                    {
                      data.photos.filter(
                        (p) =>
                          p.birdId === b.id ||
                          p.boxes.some((x) => x.birdId === b.id),
                      ).length
                    }{" "}
                    photo(s) · Identifiant {b.id.slice(0, 8)}
                  </p>
                  <button className="primary" onClick={() => choose(b.id)}>
                    Choisir cet animal →
                  </button>
                </section>
              ))}
              <section>
                <h2>+ Créer un animal</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const b = {
                      id: uid(),
                      name: name.trim(),
                      species: species.trim(),
                    };
                    update((d) => ({ ...d, birds: [...d.birds, b] }));
                    setName("");
                    setSpecies("");
                    choose(b.id);
                  }}
                >
                  <label>
                    Nom (facultatif)
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex. Kiwi"
                    />
                  </label>
                  <label>
                    Espèce (laisser vide si inconnue)
                    <input
                      value={species}
                      onChange={(e) => setSpecies(e.target.value)}
                      placeholder="Ex. Ara ararauna"
                    />
                  </label>
                  <button type="submit">Créer un ara</button>
                </form>
              </section>
            </div>
          )}
          {screen === "batch" && (
            <>
              <div className="batchgrid">
                <section>
                  <h2>1. Déposer un lot</h2>
                  <p>
                    Animal sélectionné :{" "}
                    <strong>{selected?.name || "Ara sans nom"}</strong>
                  </p>
                  <label>
                    Séance de prise de vue
                    <input
                      value={session}
                      onChange={(e) => setSession(e.target.value)}
                      placeholder="Ex. Jardin — matin du 2 novembre"
                    />
                  </label>
                  <label className="upload">
                    + Choisir les photos du lot
                    <input
                      aria-label="Photos du lot"
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={busy || !bird}
                      onChange={(e) => {
                        void importPhotos(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <p className="small">
                    JPEG, PNG et formats décodables par votre navigateur.
                    Choisissez une séance cohérente. Chaque import constitue un
                    lot distinct.
                  </p>
                </section>
                <section>
                  <h2>2. Une même tâche sur tout le lot</h2>
                  <ol>
                    {steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  <p className="small">
                    Collectez les deux côtés, à différentes dates et heures. La
                    fiabilité de l’identification reste à évaluer.
                  </p>
                </section>
              </div>
              <section className="collection">
                <h2>
                  Collection · {photos.filter((p) => p.completed).length}/
                  {photos.length} photos validées
                </h2>
                <div className="coverage">
                  {(["left", "right"] as const).map((side) => (
                    <span key={side}>
                      {side === "left" ? "Gauche" : "Droite"} :{" "}
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
                      photo(s) ·{" "}
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
                      séance(s)
                    </span>
                  ))}
                </div>
                {!photos.length ? (
                  <p>Aucune photo pour le moment.</p>
                ) : (
                  <ul className="photolist">
                    {photos.map((p) => (
                      <li key={p.id}>
                        <div>
                          <strong>{p.name}</strong>
                          <p className="small">
                            {p.sessionId || "Séance non renseignée"} ·{" "}
                            {p.completed
                              ? "Validée"
                              : `Brouillon · ${steps[data.batchStages?.[p.batchId || `${p.birdId || bird}:${p.sessionId}`] ?? p.workflowStep ?? 0]}`}
                          </p>
                        </div>
                        <button onClick={() => openPhoto(p)}>
                          Reprendre →
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
                <button onClick={() => setScreen("batch")}>
                  ← Retour au lot
                </button>
                <span>
                  {selected?.name || "Ara"} · Photo{" "}
                  {batch.findIndex((p) => p.id === photo.id) + 1}/{batch.length}{" "}
                  · {photo.name}
                </span>
                <select
                  aria-label="Choisir une photo du lot"
                  value={photo.id}
                  onChange={(e) => {
                    const p = batch.find((p) => p.id === e.target.value);
                    if (p) openPhoto(p);
                  }}
                >
                  {batch.map((p, i) => (
                    <option key={p.id} value={p.id}>
                      {i + 1}. {p.name}
                      {p.completed ? " ✓" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <nav className="steps" aria-label="Étapes d’annotation">
                {steps.map((label, i) => (
                  <button
                    key={label}
                    aria-current={step === i ? "step" : undefined}
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
                  <AnnotationCanvas
                    key={photo.id}
                    photo={photo}
                    url={url}
                    category={category}
                    side={side}
                    canDraw={canDraw}
                    onReset={() => {
                      if (category) answer({}, [category]);
                    }}
                    onAdd={(bbox) => {
                      if (!category) return;
                      patchPhoto({
                        boxes: [
                          ...photo.boxes,
                          {
                            id: uid(),
                            category,
                            birdId: photo.birdId || "",
                            side: category === "macaw" ? "unknown" : side,
                            bbox,
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
                              ? "Corps"
                              : b.category === "eye"
                                ? "Œil"
                                : "Région périoculaire"}
                            {b.category !== "macaw"
                              ? ` · ${b.side === "left" ? "gauche" : b.side === "right" ? "droite" : "côté inconnu"}`
                              : ""}
                          </span>
                          <button
                            aria-label={`Supprimer l’annotation ${i + 1}`}
                            onClick={() =>
                              patchPhoto({
                                boxes: photo.boxes.filter((x) => x.id !== b.id),
                              })
                            }
                          >
                            Supprimer
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section className="question">
                  <span className="eyebrow">
                    ÉTAPE {step + 1} / 6 ·{" "}
                    {
                      batch.filter(
                        (p) =>
                          (p.doneSteps?.includes(step) || p.completed) &&
                          stepValid(p, step),
                      ).length
                    }
                    /{batch.length} PHOTOS TRAITÉES
                  </span>
                  <h2>{titles[step]}</h2>
                  {step === 0 && (
                    <>
                      <p>
                        Vérifiez la netteté des détails. Une photo floue peut
                        être conservée, mais signalez-la.
                      </p>
                      <div className="choices">
                        {[
                          ["usable", "Nette / exploitable"],
                          ["blurry", "Floue / à refaire"],
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
                        Date et heure (sans fuseau)
                        <input
                          type="datetime-local"
                          step="1"
                          value={photo.capturedAt}
                          onChange={(e) =>
                            patchPhoto({ capturedAt: e.target.value })
                          }
                        />
                      </label>
                      <p className="small">
                        Date EXIF si disponible. Laissez vide si inconnue.
                      </p>
                      <label>
                        Séance
                        <input
                          value={photo.sessionId}
                          onChange={(e) =>
                            patchPhoto({ sessionId: e.target.value })
                          }
                        />
                      </label>
                    </>
                  )}
                  {step === 1 && (
                    <ViewReference
                      value={photo.viewpoint}
                      onChange={(viewpoint) => patchPhoto({ viewpoint })}
                    />
                  )}
                  {step === 2 && (
                    <>
                      <p>
                        Indiquez si l’animal est complet, puis encadrez tout le
                        corps visible, queue comprise si elle apparaît.
                      </p>
                      <div className="choices">
                        {[
                          ["full", "Oui, l’ara est entier"],
                          ["partial", "Non, une partie est hors cadre"],
                          ["not_visible", "Le corps n’est pas visible"],
                          ["unknown", "Je ne sais pas"],
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
                          Tracez maintenant la boîte du corps visible sur la
                          photo.
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
                        Validez cette photo, puis la suivante du lot. Chaque
                        étape a été réalisée en série sur toutes les photos.
                      </p>
                      <ul className="review">
                        {steps.slice(0, 5).map((s, i) => (
                          <li key={s}>
                            <span>{s}</span>
                            <button onClick={() => setStage(i)}>
                              {stepValid(photo, i)
                                ? "✓ Vérifier"
                                : "À compléter →"}
                            </button>
                          </li>
                        ))}
                      </ul>
                      <p className="small">
                        Le point de vue et la latéralité sont des déclarations
                        du contributeur. Aucune information inconnue n’est
                        déduite.
                      </p>
                    </>
                  )}
                  <div className="stepactions">
                    <button
                      disabled={step === 0}
                      onClick={() => setStage(Math.max(0, step - 1))}
                    >
                      Précédent
                    </button>
                    <button
                      className="primary"
                      disabled={!stepValid(photo, step)}
                      onClick={advance}
                    >
                      {step === 5
                        ? "Valider cette photo →"
                        : "Enregistrer et continuer →"}
                    </button>
                  </div>
                  <button className="quiet" onClick={() => setScreen("batch")}>
                    Quitter et reprendre plus tard
                  </button>
                </section>
              </div>
            </>
          )}
          {data.photos.some((p) => !p.birdId) && (
            <details className="legacy">
              <summary>
                Photos de la version précédente sans animal de lot
              </summary>
              <p>
                Les anciens brouillons sont conservés. Choisissez un animal
                avant de reprendre.
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
                      Associer à l’animal sélectionné
                    </button>
                  </div>
                ))}
            </details>
          )}
          <footer>
            <div>
              <h2>Votre dataset, prêt à exporter</h2>
              <p>
                {data.photos.length} photo(s) ·{" "}
                {data.photos.filter((p) => p.completed).length} validée(s).
                L’export inclut aussi les brouillons, identifiés comme tels.
              </p>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={data.consent}
                  onChange={(e) =>
                    update({ ...data, consent: e.target.checked })
                  }
                />
                Je dispose des droits nécessaires et j’autorise l’utilisation de
                ces photos sous licence{" "}
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noreferrer"
                >
                  CC BY 4.0
                </a>
                , redistribution et usage commercial avec attribution inclus.
              </label>
              <p className="small">
                Photos et brouillons restent dans ce navigateur. Exportez
                régulièrement. Les originaux peuvent contenir des métadonnées
                privées : inspectez-les avant partage. Aucun GPS n’est extrait.
              </p>
            </div>
            <button
              className="primary"
              disabled={!data.consent || !data.photos.length || busy}
              onClick={() => void download()}
            >
              {busy ? "Traitement…" : "Exporter le dataset ↗"}
            </button>
          </footer>
        </>
      )}
      <p className="savestatus" role="status">
        {status}
      </p>
    </main>
  );
}
