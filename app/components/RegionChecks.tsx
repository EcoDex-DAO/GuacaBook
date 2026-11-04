"use client";
import type { Box } from "../../lib/dataset";
import { useI18n } from "./I18n";
export default function RegionChecks({box,index,onChange}:{box:Box;index:number;onChange:(patch:Partial<Box>)=>void}) {
  const {t}=useI18n();
  return <div className="region-checks">
    <label>{t("Netteté de la région")}
      <select aria-label={`${t("Netteté de la région")} · ${index}`} value={box.usability||"unknown"} onChange={e=>onChange({usability:e.target.value as Box["usability"]})}>
        <option value="unknown">{t("Je ne sais pas")}</option><option value="usable">{t("Nette et exploitable")}</option><option value="unusable">{t("Floue ou inexploitable")}</option>
      </select>
    </label>
    <label>{t("La région est-elle masquée par un objet ou des plumes ?")}
      <select aria-label={`${t("Occlusion de la région")} · ${index}`} value={box.occluded===true?"yes":box.occluded===false?"no":"unknown"} onChange={e=>onChange({occluded:e.target.value==="unknown"?null:e.target.value==="yes"})}>
        <option value="unknown">{t("Je ne sais pas")}</option><option value="no">{t("Non, la région est dégagée")}</option><option value="yes">{t("Oui, elle est partiellement masquée")}</option>
      </select>
    </label>
  </div>;
}
