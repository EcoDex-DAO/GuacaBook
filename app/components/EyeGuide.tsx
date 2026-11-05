import {resetAnnotationFrames} from "../../lib/annotationActions";
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
    ["left", "Œil gauche", "left"],
    ["right", "Œil droit", "right"],
    ["both", "Face · deux yeux", "front"],
    ["unknown", "Je ne sais pas", "front"],
    ["no", "Non, aucun œil visible", "front"],
  ] as const;
  return (
    <div className={`eye-guide ${step===4?"periocular-guide":""}`}>
      {step === 3 && (
        <>
          <p>
            {" "}
            {t(
              "Choisissez ce que vous voyez. Les côtés sont ceux de l’animal, pas ceux de l’écran.",
            )}{" "}
          </p>
          <div className="eye-layout-options" role="group" aria-label={t("Yeux visibles")}>
            {layouts.map(([choice,label,view])=>{
              const visibleChoice=choice!=="no"&&choice!=="unknown";
              const selected=visibleChoice
                ? photo.eyeVisible==="yes"&&photo.eyeLayout===choice
                : choice==="no"?photo.eyeVisible==="no":photo.eyeVisible==="unknown"||(photo.eyeVisible==="yes"&&photo.eyeLayout==="unknown");
              return <button key={choice} type="button" aria-pressed={selected} onClick={()=>{
                setSide(choice==="both"?"left":choice==="no"?"unknown":choice);
                if(selected)return;
                const assignDrawnEye=photo.eyeVisible==="yes"&&photo.eyeLayout==="unknown"&&(choice==="left"||choice==="right");
                onChange({eyeVisible:visibleChoice?"yes":choice==="no"?"no":"unknown",
                  eyeLayout:visibleChoice?choice:undefined,regionVisible:undefined,regionBySide:undefined,
                  ...(assignDrawnEye?{boxes:photo.boxes.filter(b=>b.birdId!==(photo.birdId||"")||b.category!=="periocular_region")
                    .map(b=>b.birdId===(photo.birdId||"")&&b.category==="eye"?{...b,side:choice}:b)}:{})},assignDrawnEye?[]:["eye","periocular_region"]);
              }}>
                <BirdGlyph view={view} highlight={visibleChoice?choice:undefined} variant={choice==="no"?"hidden":choice==="unknown"?"unknown":undefined}/>
                <span>{t(label)}</span>
              </button>;
            })}
          </div>
        </>
      )}
      {step === 4 && (
        <details className="periocular-help"><summary>{t("Aide pour la région périoculaire")}</summary><p>
          {photo.eyeVisible === "yes"
            ? t(
                "Reprenez chaque côté visible pour encadrer l’œil et les motifs autour.",
              )
            : t("Étape non applicable : aucun œil confirmé visible.")}
        </p><p>{t("Sur une vue de face non retournée, la gauche de l’animal est à droite de l’image. Si le côté est incertain, choisissez « Je ne sais pas » à l’étape des yeux.")}</p></details>
      )}
      {photo.eyeVisible === "yes" &&
        (photo.eyeLayout || photo.boxes.some((b) => b.category === "eye")) && (
          <>
            {photo.eyeLayout==="both"&&<div
              className={`visual-options target-sides ${step===4?"periocular-sides":""}`}
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
              {step===4&&<button type="button" aria-label={t("Réinitialiser ce côté uniquement")} title={t("Réinitialiser ce côté uniquement")} onClick={()=>onChange(resetAnnotationFrames(photo,category,side))}>↺</button>}
            </div>}
            {step!==4&&<p className="drawhint">
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
            </p>}
            {step === 4 && (
              <div className="periocular-visibility-group"><p className="periocular-side-label">{t("Visibilité")} · {t(side==="left"?"Côté gauche":side==="right"?"Côté droit":"Côté inconnu")}</p>
              <div className="choices periocular-visibility" role="group" aria-label={t("Visibilité de la région périoculaire")}>
                {[
                  ["yes", t("La région de ce côté est visible"),t("Visible")],
                  ["partial", t("La région de ce côté est masquée / coupée"),t("Partiellement visible")],
                  ["no", t("La région de ce côté n’est pas visible"),t("Non visible")],
                  ["unknown", t("Je ne sais pas pour ce côté"),t("Je ne sais pas")],
                ].map(([v, l,compact]) => (
                  <button
                    key={v}
                    aria-pressed={visible === v} aria-label={l} title={l}
                    onClick={() =>
                      onChange({
                        regionBySide: {
                          ...photo.regionBySide,
                          [side]: v as "yes" | "partial" | "no" | "unknown",
                        },
                        boxes:
                          ["yes","partial"].includes(v)
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
                    <span>{compact}</span>
                  </button>
                ))}
              </div></div>
            )}
            {photo.eyeLayout==="both"&&step!==4&&<button onClick={()=>onChange(resetAnnotationFrames(photo,category,side))}>
              {t("Réinitialiser ce côté uniquement")}
            </button>}
            {photo.eyeLayout==="both"&&step!==4&&<p className="small">
              {" "}
              {t(
                "Sur une vue de face non retournée, la gauche de l’animal est à droite de l’image. Si le côté est incertain, choisissez « Je ne sais pas » à l’étape des yeux.",
              )}{" "}
            </p>}
          </>
        )}
    </div>
  );
}
