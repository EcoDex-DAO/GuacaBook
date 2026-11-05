"use client";
import type { Box } from "../../lib/dataset";
import {regionSharpness} from "../../lib/annotationActions";
import { useI18n } from "./I18n";
export default function RegionChecks({box,index,onChange,onHidden}:{box:Box;index:number;onChange:(patch:Partial<Box>)=>void;onHidden:()=>void}) {
  const {t}=useI18n();
  // Legacy "unusable" does not tell us whether blur or pixelation caused it.
  const sharpness=box.sharpness??(box.usability==="usable"?"sharp":box.usability==="unusable"?undefined:"unknown");
  return <div className="region-checks">
    <fieldset className="region-choice-group" aria-label={`${t("Netteté de la région")} · ${index}`}>
      <legend>{t("Netteté de la région")}</legend>
      <div className="region-choice-buttons">
        {([["sharp","Net"],["blurry","Flou"],["pixelated","Pixelisé"],["unknown","Je ne sais pas"]] as const).map(([value,label])=>
          <button key={value} type="button" aria-pressed={sharpness===value} onClick={()=>onChange(regionSharpness(value))}>{t(label)}</button>)}
      </div>
      {box.usability==="unusable"&&!box.sharpness&&<p className="small">{t("Ancienne annotation : inexploitable, cause non précisée.")}</p>}
    </fieldset>
    <fieldset className="region-choice-group" aria-label={`${t("Occlusion de la région")} · ${index}`}>
      <legend>{t("Masquage de la région")}</legend>
      <div className="region-choice-buttons">
        <button type="button" aria-pressed={box.occluded===false} onClick={()=>onChange({occluded:false})}>{t("Complètement visible")}</button>
        <button type="button" aria-pressed={box.occluded===true} onClick={()=>onChange({occluded:true})}>{t("Partiellement")}</button>
        <button type="button" aria-pressed={false} onClick={onHidden}>{t("Cachée")}</button>
        <button type="button" aria-pressed={box.occluded==null} onClick={()=>onChange({occluded:null})}>{t("Je ne sais pas")}</button>
      </div>
    </fieldset>
  </div>;
}
