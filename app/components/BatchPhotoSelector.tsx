"use client";
import {useEffect,useRef,useState} from "react";
import type {Photo} from "../../lib/dataset";
import {stepComplete} from "../../lib/dataset";
import {useI18n} from "./I18n";
function Thumbnail({photo}:{photo:Photo}) {
  const [url,setUrl]=useState("");
  useEffect(()=>{const value=URL.createObjectURL(photo.blob);setUrl(value);return()=>URL.revokeObjectURL(value);},[photo.blob]);
  return <img src={url||undefined} alt="" loading="lazy" width="76" height="54"/>;
}
export default function BatchPhotoSelector({photos,active,step,disabled,onSelect}:{photos:Photo[];active:string;step:number;disabled:boolean;onSelect:(photo:Photo)=>void}) {
  const {t}=useI18n();const index=photos.findIndex(p=>p.id===active);
  const done=(p:Photo)=>stepComplete(p,step);
  const rail=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const element=rail.current;if(!element)return;
    const reveal=()=>{
      const current=element.querySelector<HTMLButtonElement>('button[aria-current="true"]');
      if(!current)return;
      element.scrollTop=current.offsetTop-(element.clientHeight-current.offsetHeight)/2;
      element.scrollLeft=current.offsetLeft-(element.clientWidth-current.offsetWidth)/2;
    };
    const observer=new ResizeObserver(reveal);observer.observe(element);reveal();
    return()=>observer.disconnect();
  },[active,photos.length]);
  return <section className="batch-photo-selector" aria-label={t("Photos du lot")}>
    <div className="batch-photo-controls">
      <button aria-label={t("Photo précédente")} title={t("Photo précédente")} disabled={disabled||index<=0} onClick={()=>onSelect(photos[index-1])}><span aria-hidden="true">‹</span></button>
      <label><span title={t("Photo {number} sur {total}",{number:index+1,total:photos.length})}>{index+1} / {photos.length}</span>
        <select aria-label={t("Choisir une photo du lot")} disabled={disabled} value={active} onChange={e=>{const p=photos.find(p=>p.id===e.target.value);if(p)onSelect(p);}}>
          {photos.map((p,i)=><option key={p.id} value={p.id}>{i+1}/{photos.length} · {p.name}{done(p)?" ✓":""}</option>)}
        </select>
      </label>
      <button aria-label={t("Photo suivante")} title={t("Photo suivante")} disabled={disabled||index>=photos.length-1} onClick={()=>onSelect(photos[index+1])}><span aria-hidden="true">›</span></button>
    </div>
    <div ref={rail} className="batch-thumbnails">
      {photos.map((p,i)=><button key={p.id} disabled={disabled} aria-current={p.id===active?"true":undefined}
        aria-label={t("Photo {number} sur {total} : {name}",{number:i+1,total:photos.length,name:p.name})} onClick={()=>onSelect(p)}>
        <Thumbnail photo={p}/><span>{i+1}{done(p)?" ✓":""}</span>
      </button>)}
    </div>
  </section>;
}
