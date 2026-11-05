"use client";
import {useEffect,useState} from "react";
import type {Photo} from "../../lib/dataset";
import {stepValid} from "../../lib/dataset";
import {useI18n} from "./I18n";
function Thumbnail({photo}:{photo:Photo}) {
  const [url,setUrl]=useState("");
  useEffect(()=>{const value=URL.createObjectURL(photo.blob);setUrl(value);return()=>URL.revokeObjectURL(value);},[photo.blob]);
  return <img src={url||undefined} alt="" loading="lazy" width="76" height="54"/>;
}
export default function BatchPhotoSelector({photos,active,step,disabled,onSelect}:{photos:Photo[];active:string;step:number;disabled:boolean;onSelect:(photo:Photo)=>void}) {
  const {t}=useI18n();const index=photos.findIndex(p=>p.id===active);
  const done=(p:Photo)=>(p.completed||p.doneSteps?.includes(step))&&stepValid(p,step);
  const start=Math.max(0,Math.min(index-2,photos.length-5));
  return <section className="batch-photo-selector" aria-label={t("Photos du lot")}>
    <div className="batch-photo-controls">
      <button disabled={disabled||index<=0} onClick={()=>onSelect(photos[index-1])}>{t("Photo précédente")}</button>
      <label><span>{t("Photo {number} sur {total}",{number:index+1,total:photos.length})}</span>
        <select aria-label={t("Choisir une photo du lot")} disabled={disabled} value={active} onChange={e=>{const p=photos.find(p=>p.id===e.target.value);if(p)onSelect(p);}}>
          {photos.map((p,i)=><option key={p.id} value={p.id}>{i+1}/{photos.length} · {p.name}{done(p)?" ✓":""}</option>)}
        </select>
      </label>
      <button disabled={disabled||index>=photos.length-1} onClick={()=>onSelect(photos[index+1])}>{t("Photo suivante")}</button>
    </div>
    <div className="batch-thumbnails">
      {photos.slice(start,start+5).map((p,i)=><button key={p.id} disabled={disabled} aria-current={p.id===active?"true":undefined}
        aria-label={t("Photo {number} sur {total} : {name}",{number:start+i+1,total:photos.length,name:p.name})} onClick={()=>onSelect(p)}>
        <Thumbnail photo={p}/><span>{start+i+1}{done(p)?" ✓":""}</span>
      </button>)}
    </div>
  </section>;
}
