"use client";
import { useEffect, useRef, useState } from "react";
import { get, set } from "idb-keyval";
import exifr from "exifr";
import JSZip from "jszip";
import {
  Bird,
  Box,
  Dataset,
  Photo,
  coco,
  emptyDataset,
  makeBox,
} from "../lib/dataset";
const uid = () => crypto.randomUUID();
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
export default function Home() {
  const [data, update] = useState<Dataset>(emptyDataset),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState("Chargement du brouillon…"),
    [active, setActive] = useState(""),
    [bird, setBird] = useState(""),
    [category, setCategory] = useState<Box["category"]>("periocular_region"),
    [side, setSide] = useState<Box["side"]>("unknown"),
    [session, setSession] = useState(""),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState(""),
    [name, setName] = useState(""),
    [species, setSpecies] = useState("");
  const svg = useRef<SVGSVGElement>(null),
    saveQueue = useRef(Promise.resolve()),
    [drawing, draw] = useState<{
      start: { x: number; y: number };
      end: { x: number; y: number };
    } | null>(null);
  const photo = data.photos.find((p) => p.id === active);
  useEffect(() => {
    get<Dataset>("guacabook-v1")
      .then((d) => {
        if (d) {
          update(d);
          setActive(d.photos[0]?.id || "");
          setBird(d.birds[0]?.id || "");
        }
        setReady(true);
        setStatus("Brouillon chargé — stockage local uniquement");
      })
      .catch(() =>
        setStatus(
          "Stockage local inaccessible. Rechargez ou vérifiez les permissions du navigateur.",
        ),
      );
  }, []);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setStatus("Enregistrement…");
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => set("guacabook-v1", data));
    saveQueue.current
      .then(() => {
        if (alive) setStatus("Brouillon enregistré sur cet appareil");
      })
      .catch(() => {
        if (alive)
          setStatus(
            "Échec de sauvegarde : stockage plein ou indisponible. Exportez vos données.",
          );
      });
    return () => {
      alive = false;
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
  function patchPhoto(patch: Partial<Photo>) {
    if (photo)
      update((d) => ({
        ...d,
        photos: d.photos.map((p) =>
          p.id === photo.id ? { ...p, ...patch } : p,
        ),
      }));
  }
  function addBird() {
    const b: Bird = { id: uid(), name: name.trim(), species: species.trim() };
    update((d) => ({ ...d, birds: [...d.birds, b] }));
    setBird(b.id);
    setName("");
    setSpecies("");
  }
  async function importPhotos(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    const imported: Photo[] = [];
    const failed: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const bitmap = await createImageBitmap(file, {
          imageOrientation: "from-image",
        });
        let capturedAt = "";
        try {
          const meta = await exifr.parse(file, { pick: ["DateTimeOriginal"] });
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
          quality: "unreviewed",
          boxes: [],
        });
        bitmap.close();
      } catch {
        failed.push(file.name);
      }
    }
    update((d) => ({ ...d, photos: [...d.photos, ...imported] }));
    if (imported.length) setActive(imported[0].id);
    setBusy(false);
    if (failed.length)
      alert(
        `Photos non prises en charge : ${failed.join(", ")}. Convertissez les fichiers HEIC/RAW en JPEG ou PNG.`,
      );
  }
  const point = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * (photo?.width || 1),
      y: ((e.clientY - r.top) / r.height) * (photo?.height || 1),
    };
  };
  async function download() {
    setBusy(true);
    try {
      const result = coco(data);
      const zip = new JSZip();
      zip.file("annotations.json", JSON.stringify(result, null, 2));
      zip.file(
        "README.txt",
        "GuacaBook v1 — CC BY 4.0\nImages originales, annotations en pixels après orientation EXIF. Voir le README du projet pour les extensions. Aucun recadrage généré. Les originaux peuvent contenir des métadonnées privées : inspectez-les avant de partager cette archive.",
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
      alert(e instanceof Error ? e.message : "Échec de l’export");
    } finally {
      setBusy(false);
    }
  }
  if (!ready)
    return (
      <main>
        <h1>GuacaBook</h1>
        <p role="status">{status}</p>
      </main>
    );
  return (
    <main>
      <header>
        <div>
          <span className="eyebrow">COLLECTER · ANNOTER · COMPRENDRE</span>
          <h1>
            GuacaBook <span>↗</span>
          </h1>
          <p>Chaque regard raconte une histoire. Construisons la collection.</p>
        </div>
        <span className="badge">VERSION LOCALE · 01</span>
      </header>
      <div className="notice">
        Vos photos restent dans ce navigateur. Exportez régulièrement : effacer
        les données du site supprime les brouillons. Aucun modèle d’IA ni suivi
        GPS.
      </div>
      <div className="workspace">
        <aside>
          <section>
            <h2>01 / Contributeur</h2>
            <label>
              Nom ou pseudonyme
              <input
                value={data.profile}
                onChange={(e) => update({ ...data, profile: e.target.value })}
                placeholder="Votre pseudonyme"
              />
            </label>
            <p className="small">
              Ce nom sera inclus dans l’export pour l’attribution.
            </p>
          </section>
          <section>
            <h2>02 / Vos aras</h2>
            <label>
              Ara sélectionné
              <select value={bird} onChange={(e) => setBird(e.target.value)}>
                <option value="">Identité inconnue</option>
                {data.birds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name || b.id.slice(0, 8)} ·{" "}
                    {b.species || "Espèce inconnue"}
                  </option>
                ))}
              </select>
            </label>
            <details>
              <summary>Enregistrer un ara</summary>
              <label>
                Nom (facultatif)
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Espèce (laisser vide si inconnue)
                <input
                  value={species}
                  onChange={(e) => setSpecies(e.target.value)}
                  placeholder="Ex. Ara ararauna"
                />
              </label>
              <button onClick={addBird}>Créer un ara</button>
            </details>
            {bird && (
              <div className="coverage">
                <strong>Collection de cet ara</strong>
                {(["left", "right", "unknown"] as const).map((s) => {
                  const ps = data.photos.filter((p) =>
                    p.boxes.some(
                      (b) =>
                        b.birdId === bird &&
                        b.category === "periocular_region" &&
                        b.side === s,
                    ),
                  );
                  return (
                    <p key={s}>
                      {s === "left"
                        ? "Gauche"
                        : s === "right"
                          ? "Droite"
                          : "Côté inconnu"}{" "}
                      : {ps.length} photo(s),{" "}
                      {new Set(ps.map((p) => p.sessionId).filter(Boolean)).size}{" "}
                      séance(s)
                    </p>
                  );
                })}
                <p className="small">
                  Comptage des annotations ; netteté et diversité restent à
                  vérifier.
                </p>
              </div>
            )}
          </section>
          <section>
            <h2>03 / Importer</h2>
            <label>
              Séance de prise de vue
              <input
                value={session}
                onChange={(e) => setSession(e.target.value)}
                placeholder="Ex. Jardin — 2 novembre matin"
              />
            </label>
            <label className="upload">
              + Choisir des photos
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={busy}
                onChange={(e) => {
                  void importPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="small">
              JPEG, PNG et formats reconnus par votre navigateur. La date reste
              inconnue si l’EXIF est absent.
            </p>
          </section>
        </aside>
        <article>
          <div className="sectionhead">
            <h2>04 / Atelier d’annotation</h2>
            <span>{data.photos.length} photo(s)</span>
          </div>
          {data.photos.length > 0 && (
            <nav aria-label="Photos" className="photolist">
              {data.photos.map((p, i) => (
                <button
                  className={p.id === active ? "selected" : ""}
                  key={p.id}
                  onClick={() => {
                    setActive(p.id);
                    draw(null);
                  }}
                >
                  {i + 1}. {p.name}
                </button>
              ))}
            </nav>
          )}
          {!photo ? (
            <div className="empty">
              <span>◎</span>
              <h3>Un premier regard</h3>
              <p>Créez un ara, puis importez ses photos pour commencer.</p>
              <p>
                Privilégiez une région autour de l’œil nette, à gauche et à
                droite, à plusieurs dates et moments de la journée. Complétez
                avec des vues de l’animal entier.
              </p>
            </div>
          ) : (
            <>
              <div className="toolbar">
                <label>
                  Catégorie
                  <select
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as Box["category"])
                    }
                  >
                    <option value="periocular_region">
                      Région périoculaire
                    </option>
                    <option value="macaw">Ara entier</option>
                  </select>
                </label>
                {category === "periocular_region" && (
                  <label>
                    Côté anatomique
                    <select
                      value={side}
                      onChange={(e) => setSide(e.target.value as Box["side"])}
                    >
                      <option value="unknown">Inconnu</option>
                      <option value="left">Gauche</option>
                      <option value="right">Droite</option>
                    </select>
                  </label>
                )}
              </div>
              <p className="small">
                Tracez un rectangle sur la photo. L’identité sélectionnée et le
                côté s’appliquent aux nouvelles annotations.
              </p>
              <svg
                ref={svg}
                className="canvas"
                role="img"
                aria-label="Photo à annoter par glisser-déposer"
                viewBox={`0 0 ${photo.width} ${photo.height}`}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const p = point(e);
                  draw({ start: p, end: p });
                }}
                onPointerMove={(e) => {
                  if (drawing) draw({ ...drawing, end: point(e) });
                }}
                onPointerCancel={() => draw(null)}
                onPointerUp={(e) => {
                  if (!drawing) return;
                  const bbox = makeBox(
                    drawing.start,
                    point(e),
                    photo.width,
                    photo.height,
                  );
                  if (bbox[2] >= 3 && bbox[3] >= 3)
                    patchPhoto({
                      boxes: [
                        ...photo.boxes,
                        { id: uid(), category, birdId: bird, side, bbox },
                      ],
                    });
                  draw(null);
                }}
              >
                <image href={url} width={photo.width} height={photo.height} />
                {photo.boxes.map((b) => (
                  <rect
                    key={b.id}
                    x={b.bbox[0]}
                    y={b.bbox[1]}
                    width={b.bbox[2]}
                    height={b.bbox[3]}
                    fill="none"
                    stroke={b.category === "macaw" ? "#ffbf67" : "#79ffca"}
                    strokeWidth="3"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {drawing &&
                  (() => {
                    const b = makeBox(
                      drawing.start,
                      drawing.end,
                      photo.width,
                      photo.height,
                    );
                    return (
                      <rect
                        x={b[0]}
                        y={b[1]}
                        width={b[2]}
                        height={b[3]}
                        fill="#ffffff22"
                        stroke="white"
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })()}
              </svg>
              <div className="metadata">
                <label>
                  Date et heure (sans fuseau)
                  <input
                    type="datetime-local"
                    step="1"
                    value={photo.capturedAt}
                    onChange={(e) => patchPhoto({ capturedAt: e.target.value })}
                  />
                </label>
                <label>
                  Séance
                  <input
                    value={photo.sessionId}
                    onChange={(e) => patchPhoto({ sessionId: e.target.value })}
                  />
                </label>
                <label>
                  Qualité visuelle
                  <select
                    value={photo.quality}
                    onChange={(e) =>
                      patchPhoto({
                        quality: e.target.value as Photo["quality"],
                      })
                    }
                  >
                    <option value="unreviewed">À vérifier</option>
                    <option value="usable">Nette / exploitable</option>
                    <option value="blurry">Floue / à refaire</option>
                  </select>
                </label>
              </div>
              <ul className="annotations">
                {photo.boxes.map((b, i) => (
                  <li key={b.id}>
                    <span>
                      {i + 1}.{" "}
                      {b.category === "macaw" ? "Ara" : "Région périoculaire"} ·{" "}
                      {data.birds.find((x) => x.id === b.birdId)?.name ||
                        b.birdId.slice(0, 8) ||
                        "Identité inconnue"}{" "}
                      {b.category === "periocular_region"
                        ? `· ${b.side === "left" ? "gauche" : b.side === "right" ? "droite" : "côté inconnu"}`
                        : ""}
                    </span>
                    <button
                      onClick={() =>
                        patchPhoto({
                          boxes: photo.boxes.filter((x) => x.id !== b.id),
                        })
                      }
                      aria-label={`Supprimer l’annotation ${i + 1}`}
                    >
                      Supprimer
                    </button>
                  </li>
                ))}
              </ul>
              <button
                className="danger"
                onClick={() => {
                  if (
                    confirm(
                      "Supprimer cette photo et ses annotations du brouillon ?",
                    )
                  ) {
                    update({
                      ...data,
                      photos: data.photos.filter((p) => p.id !== photo.id),
                    });
                    setActive(
                      data.photos.find((p) => p.id !== photo.id)?.id || "",
                    );
                  }
                }}
              >
                Supprimer cette photo
              </button>
            </>
          )}
        </article>
      </div>
      <section className="guide">
        <h2>Un cadrage cohérent, des données utiles</h2>
        <p>
          <strong>Région périoculaire :</strong> incluez l’œil entier et la
          peau, les lignes ou les plumes distinctives autour, sans couper les
          détails. Gardez un cadrage comparable entre séances. Le côté est celui
          de l’animal : en cas de doute, choisissez « inconnu ».
        </p>
        <p>
          <strong>Plusieurs aras ?</strong> Sélectionnez l’identité de chacun
          avant de tracer ses rectangles. Les boîtes « ara entier » et « région
          périoculaire » restent distinctes. L’identification par ces détails
          est une hypothèse à évaluer.
        </p>
      </section>
      <footer>
        <div>
          <h2>05 / Exporter la collection</h2>
          <p>Archive ZIP : photos originales + annotations COCO JSON.</p>
          <label className="consent">
            <input
              type="checkbox"
              checked={data.consent}
              onChange={(e) => update({ ...data, consent: e.target.checked })}
            />
            Je dispose des droits nécessaires et j’autorise l’utilisation des
            photos sous licence{" "}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY 4.0
            </a>
            , y compris la redistribution et l’usage commercial avec
            attribution.
          </label>
          <p className="small">
            L’archive conserve les originaux : leurs métadonnées peuvent inclure
            des informations privées, dont la localisation. Inspectez-les avant
            de partager. Aucun GPS n’est extrait par l’application.
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
      <p role="status" className="savestatus">
        {status}
      </p>
    </main>
  );
}
