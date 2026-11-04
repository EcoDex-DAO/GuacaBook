"use client";
import { useState } from "react";
import { useI18n } from "./I18n";
import { declaredSpecies, macawSpecies, SpeciesInfo } from "../../lib/macaws";
import type { Bird } from "../../lib/dataset";

function SpeciesPicker({ label, value, other, onChange, onOther, parent = false }: {
  label: string; value: string; other: string;
  onChange: (value: string) => void; onOther: (value: string) => void; parent?: boolean;
}) {
  const { t } = useI18n();
  return <>
    <label>{label}
      <select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>
        <option value="">{t("Espèce inconnue")}</option>
        {macawSpecies.map(([scientificName, name]) => <option key={scientificName} value={scientificName}>{t(name)} — {scientificName}</option>)}
        <option value="hybrid">{t(parent ? "Parent lui-même hybride" : "Hybride")}</option>
        <option value="other">{t("Autre")}</option>
      </select>
    </label>
    {value === "other" && <label>{t("Précisez l’espèce")} · {label}
      <input required maxLength={160} value={other} onChange={event => onOther(event.target.value)} />
    </label>}
  </>;
}

export default function AnimalForm({ onCreate }: { onCreate: (bird: Bird) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "unknown">("unknown");
  const [birthYear, setBirthYear] = useState("");
  const currentYear = new Date().getFullYear();
  const [species, setSpecies] = useState("");
  const [other, setOther] = useState("");
  const [hybridName, setHybridName] = useState("");
  const [parents, setParents] = useState<[string, string]>(["", ""]);
  const [otherParents, setOtherParents] = useState<[string, string]>(["", ""]);
  return <section>
    <h2>{t("+ Créer un animal")}</h2>
    <form onSubmit={event => {
      event.preventDefault();
      let speciesInfo: SpeciesInfo;
      if (species === "hybrid") {
        speciesInfo = { kind: "hybrid", parents: [declaredSpecies(parents[0], otherParents[0]), declaredSpecies(parents[1], otherParents[1])], ...(hybridName.trim() ? { label: hybridName.trim() } : {}) };
      } else speciesInfo = declaredSpecies(species, other) as Exclude<SpeciesInfo, { kind: "hybrid" }>;
      if (speciesInfo.kind === "other" && !speciesInfo.label) return;
      if (speciesInfo.kind === "hybrid" && speciesInfo.parents.some(parent => parent.kind === "other" && !parent.label)) return;
      const year = birthYear === "" ? null : Number(birthYear);
      if (year !== null && (!Number.isInteger(year) || year < 1 || year > currentYear)) return;
      onCreate({
        id: crypto.randomUUID(), name: name.trim(), speciesInfo, sex, birthYear: year,
        species: speciesInfo.kind === "species" ? speciesInfo.scientificName : speciesInfo.kind === "other" ? speciesInfo.label : speciesInfo.kind === "hybrid" ? "hybrid" : "",
      });
      setSex("unknown"); setBirthYear("");
      setName(""); setSpecies(""); setOther(""); setHybridName(""); setParents(["", ""]); setOtherParents(["", ""]);
    }}>
      <label>{t("Nom (facultatif)")}<input value={name} onChange={event => setName(event.target.value)} placeholder={t("Ex. Kiwi")} /></label>
      <SpeciesPicker label={t("Espèce")} value={species} other={other} onChange={setSpecies} onOther={setOther} />
      {species === "hybrid" && <fieldset className="hybrid-fields">
        <legend>{t("Ascendance de l’hybride (facultatif)")}</legend>
        <p className="small">{t("Indiquez uniquement ce que vous savez. Les parents A et B ne précisent pas le sexe. Si l’ascendance est inconnue ou multiple, ne la devinez pas.")}</p>
        {([0, 1] as const).map(index => <SpeciesPicker key={index} parent label={t(index === 0 ? "Parent A" : "Parent B")}
          value={parents[index]} other={otherParents[index]}
          onChange={value => setParents(current => index === 0 ? [value, current[1]] : [current[0], value])}
          onOther={value => setOtherParents(current => index === 0 ? [value, current[1]] : [current[0], value])} />)}
        <label>{t("Nom du croisement (facultatif)")}<input maxLength={160} value={hybridName} onChange={event => setHybridName(event.target.value)} placeholder={t("Ex. Catalina, si connu")} /></label>
        <p className="small">{t("Le nom du croisement ne permet pas de déduire automatiquement les espèces des parents.")}</p>
      </fieldset>}
      <label>{t("Sexe")}
        <select aria-label={t("Sexe")} value={sex} onChange={event => setSex(event.target.value as typeof sex)}>
          <option value="unknown">{t("Sexe inconnu")}</option>
          <option value="male">{t("Mâle")}</option>
          <option value="female">{t("Femelle")}</option>
        </select>
      </label>
      <label>{t("Année de naissance (facultatif)")}
        <input type="number" min={1} max={currentYear} step={1} inputMode="numeric" value={birthYear} onChange={event => setBirthYear(event.target.value)} placeholder={t("Inconnue")} />
      </label>
      <button type="submit">{t("Créer un ara")}</button>
    </form>
  </section>;
}
