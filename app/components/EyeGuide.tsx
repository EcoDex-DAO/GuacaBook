import { Box, Photo, requiredSides } from "../../lib/dataset";
import BirdGlyph from "./BirdGlyph";
export default function EyeGuide({
  photo,
  step,
  side,
  setSide,
  onChange,
}: {
  photo: Photo;
  step: number;
  side: Box["side"];
  setSide: (s: Box["side"]) => void;
  onChange: (p: Partial<Photo>, remove?: Box["category"][]) => void;
}) {
  const category = step === 3 ? "eye" : "periocular_region";
  const visible =
    photo.regionBySide?.[side] ??
    (photo.eyeLayout === "both" ? undefined : photo.regionVisible);
  const layouts = [
    ["left", "Œil gauche", "left"],
    ["both", "Deux yeux · face", "front"],
    ["right", "Œil droit", "right"],
    ["unknown", "Côté inconnu", "front"],
  ] as const;
  return (
    <div className="eye-guide">
      {step === 3 && (
        <>
          <p>
            Choisissez ce que vous voyez. Les côtés sont ceux de l’animal, pas
            ceux de l’écran.
          </p>
          <div className="choices">
            {[
              ["yes", "Oui, au moins un œil visible"],
              ["no", "Non, aucun œil visible"],
              ["unknown", "Je ne sais pas"],
            ].map(([v, l]) => (
              <button
                key={v}
                aria-pressed={photo.eyeVisible === v}
                onClick={() =>
                  onChange(
                    {
                      eyeVisible: v as Photo["eyeVisible"],
                      ...(v !== "yes"
                        ? {
                            regionVisible: undefined,
                            regionBySide: undefined,
                            eyeLayout: undefined,
                          }
                        : {}),
                    },
                    v !== "yes" ? ["eye", "periocular_region"] : [],
                  )
                }
              >
                <BirdGlyph
                  view="front"
                  highlight={v === "yes" ? "both" : undefined}
                  variant={
                    v === "no"
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
          {photo.eyeVisible === "yes" && (
            <div className="visual-options" aria-label="Yeux visibles">
              {layouts.map(([v, l, view]) => (
                <button
                  key={v}
                  aria-pressed={photo.eyeLayout === v}
                  onClick={() => {
                    setSide(v === "both" ? "left" : v);
                    if (photo.eyeLayout === v) return;
                    onChange(
                      {
                        eyeLayout: v,
                        regionVisible: undefined,
                        regionBySide: undefined,
                      },
                      photo.eyeLayout !== v ? ["eye", "periocular_region"] : [],
                    );
                  }}
                >
                  <BirdGlyph view={view} highlight={v} />
                  <span>{l}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {step === 4 && (
        <p>
          {photo.eyeVisible === "yes"
            ? "Reprenez chaque côté visible pour encadrer l’œil et les motifs autour."
            : "Étape non applicable : aucun œil confirmé visible."}
        </p>
      )}
      {photo.eyeVisible === "yes" &&
        (photo.eyeLayout || photo.boxes.some((b) => b.category === "eye")) && (
          <>
            <div
              className="visual-options target-sides"
              aria-label="Zone à tracer"
            >
              {requiredSides(photo).map((s) => {
                const done = photo.boxes.some(
                  (b) =>
                    b.category === category &&
                    b.birdId === (photo.birdId || "") &&
                    b.side === s,
                );
                return (
                  <button
                    key={s}
                    aria-pressed={side === s}
                    onClick={() => setSide(s)}
                  >
                    <BirdGlyph
                      view={
                        photo.eyeLayout === "both"
                          ? "front"
                          : s === "unknown"
                            ? "front"
                            : s
                      }
                      highlight={s}
                    />
                    <span>
                      {s === "left"
                        ? "Côté gauche"
                        : s === "right"
                          ? "Côté droit"
                          : "Côté inconnu"}
                      {done ? " · ✓" : ""}
                    </span>
                    <small>
                      {photo.eyeLayout === "both"
                        ? s === "left"
                          ? "À droite sur une photo de face"
                          : "À gauche sur une photo de face"
                        : ""}
                    </small>
                  </button>
                );
              })}
            </div>
            <p className="drawhint">
              {step === 3 ? "Tracez l’œil" : "Tracez la région périoculaire"}{" "}
              {side === "left"
                ? "gauche"
                : side === "right"
                  ? "droite"
                  : "de côté inconnu"}{" "}
              de l’animal.
              {photo.eyeLayout === "both"
                ? " Puis sélectionnez l’autre côté : chaque côté a son propre cadre."
                : ""}
            </p>
            {step === 4 && (
              <div className="choices">
                {[
                  ["yes", "La région de ce côté est visible"],
                  ["no", "La région de ce côté est masquée / coupée"],
                  ["unknown", "Je ne sais pas pour ce côté"],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    aria-pressed={visible === v}
                    onClick={() =>
                      onChange({
                        regionBySide: {
                          ...photo.regionBySide,
                          [side]: v as "yes" | "no" | "unknown",
                        },
                        boxes:
                          v === "yes"
                            ? photo.boxes
                            : photo.boxes.filter(
                                (b) =>
                                  !(
                                    b.category === "periocular_region" &&
                                    b.birdId === (photo.birdId || "") &&
                                    b.side === side
                                  ),
                              ),
                      })
                    }
                  >
                    <BirdGlyph
                      view={
                        photo.eyeLayout === "both"
                          ? "front"
                          : side === "unknown"
                            ? "front"
                            : side
                      }
                      highlight={side}
                    />
                    <span>{l}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() =>
                onChange({
                  boxes: photo.boxes.filter(
                    (b) =>
                      !(
                        b.category === category &&
                        b.birdId === (photo.birdId || "") &&
                        b.side === side
                      ),
                  ),
                })
              }
            >
              Réinitialiser ce côté uniquement
            </button>
            <p className="small">
              Sur une vue de face non retournée, la gauche de l’animal est à
              droite de l’image. Si la photo est en miroir ou le côté incertain,
              revenez aux yeux et choisissez « côté inconnu ».
            </p>
          </>
        )}
    </div>
  );
}
