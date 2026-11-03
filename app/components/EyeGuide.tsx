import { useI18n } from "./I18n";
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
  const { t } = useI18n();
  const category = step === 3 ? "eye" : "periocular_region";
  const visible =
    photo.regionBySide?.[side] ??
    (photo.eyeLayout === "both" ? undefined : photo.regionVisible);
  const layouts = [
    ["left", t("Œil gauche"), "left"],
    ["both", t("Deux yeux · face"), "front"],
    ["right", t("Œil droit"), "right"],
    ["unknown", t("Côté inconnu"), "front"],
  ] as const;
  return (
    <div className="eye-guide">
      {step === 3 && (
        <>
          <p>
            {" "}
            {t(
              "Choisissez ce que vous voyez. Les côtés sont ceux de l’animal, pas ceux de l’écran.",
            )}{" "}
          </p>
          <div className="choices">
            {[
              ["yes", t("Oui, au moins un œil visible")],
              ["no", t("Non, aucun œil visible")],
              ["unknown", t("Je ne sais pas")],
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
            <div className="visual-options" aria-label={t("Yeux visibles")}>
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
            ? t(
                "Reprenez chaque côté visible pour encadrer l’œil et les motifs autour.",
              )
            : t("Étape non applicable : aucun œil confirmé visible.")}
        </p>
      )}
      {photo.eyeVisible === "yes" &&
        (photo.eyeLayout || photo.boxes.some((b) => b.category === "eye")) && (
          <>
            <div
              className="visual-options target-sides"
              aria-label={t("Zone à tracer")}
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
                        ? t("Côté gauche")
                        : s === "right"
                          ? t("Côté droit")
                          : t("Côté inconnu")}
                      {done ? " · ✓" : ""}
                    </span>
                    <small>
                      {photo.eyeLayout === "both"
                        ? s === "left"
                          ? t("À droite sur une photo de face")
                          : t("À gauche sur une photo de face")
                        : ""}
                    </small>
                  </button>
                );
              })}
            </div>
            <p className="drawhint">
              {t("Tracez {region} : {side}.", {
                region: t(step === 3 ? "Œil" : "Région périoculaire"),
                side: t(
                  side === "left"
                    ? "Côté gauche"
                    : side === "right"
                      ? "Côté droit"
                      : "Côté inconnu",
                ),
              })}{" "}
              {photo.eyeLayout === "both"
                ? t(
                    "Puis sélectionnez l’autre côté : chaque côté a son propre cadre.",
                  )
                : ""}
            </p>
            {step === 4 && (
              <div className="choices">
                {[
                  ["yes", t("La région de ce côté est visible")],
                  ["no", t("La région de ce côté est masquée / coupée")],
                  ["unknown", t("Je ne sais pas pour ce côté")],
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
              {" "}
              {t("Réinitialiser ce côté uniquement")}{" "}
            </button>
            <p className="small">
              {" "}
              {t(
                "Sur une vue de face non retournée, la gauche de l’animal est à droite de l’image. Si la photo est en miroir ou le côté incertain, revenez aux yeux et choisissez « côté inconnu ».",
              )}{" "}
            </p>
          </>
        )}
    </div>
  );
}
