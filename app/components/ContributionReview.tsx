"use client";
import { useEffect, useState } from "react";
import type { CloudRow } from "../../lib/cloud";
import { loadCloudDataset } from "../../lib/cloud";
import type { Dataset, Box, Photo } from "../../lib/dataset";
import type { Review } from "../../lib/v1";
import { regionReasons, reasonLabels, validBox } from "../../lib/v1";
import { useAccount } from "./AccountGate";
import { useI18n } from "./I18n";
function CropPreview({ photo, box }: { photo: Photo; box: Box }) {
  const [url,setUrl]=useState("");
  useEffect(()=>{
    let live=true, objectUrl="";
    void (async()=>{
      if(!validBox(photo,box))return;
      const bitmap=await createImageBitmap(photo.blob,{imageOrientation:"from-image"});
      try {
        const canvas=document.createElement("canvas");const [x,y,w,h]=box.bbox;
        canvas.width=Math.ceil(w);canvas.height=Math.ceil(h);
        canvas.getContext("2d")?.drawImage(bitmap,x,y,w,h,0,0,canvas.width,canvas.height);
        const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png"));
        if(blob&&live){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}
      } finally {bitmap.close();}
    })().catch(()=>{});
    return()=>{live=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[photo,box]);
  return url?<img className="review-crop" src={url} alt="" />:null;
}
export default function ContributionReview({ row }: { row: CloudRow }) {
  const {client}=useAccount(),{t}=useI18n();
  const [hashes,setHashes]=useState<Record<string,string>>({});
  const [data,setData]=useState<Dataset|null>(null),[reviews,setReviews]=useState<Review[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!client)return;
    let live=true;setData(null);setError("");
    void (async()=>{
      const [dataset,result]=await Promise.all([loadCloudDataset(client,row),client.from("annotation_reviews").select("*").eq("owner_id",row.owner_id).eq("dataset_revision",row.revision)]);
      if(result.error)throw result.error;
      const entries=await Promise.all(dataset.photos.map(async photo=>[photo.id,Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await photo.blob.arrayBuffer()))).map(b=>b.toString(16).padStart(2,"0")).join("")]));
      if(live){setData(dataset);setReviews(result.data||[]);setHashes(Object.fromEntries(entries));}
    })().catch(()=>{if(live)setError("Revue indisponible. Exécutez la migration 004 et rechargez les contributions.");});
    return()=>{live=false;};
  },[client,row]);
  if(error)return <p role="alert">{t(error)}</p>;
  if(!data)return <p role="status">{t("Chargement des régions…")}</p>;
  const regions=data.photos.flatMap(photo=>photo.boxes.filter(box=>box.category==="periocular_region").map(box=>({photo,box})));
  return <section className="contribution-review">
    <h3>{t("Revue des régions périoculaires")}</h3>
    <p className="small">{t("Vérifiez l’identité, le côté anatomique, le cadrage et la netteté. Toute modification de la collection rend ces décisions obsolètes.")}</p>
    {!regions.length&&<p>{t("Aucune région à examiner.")}</p>}
    {regions.map(({photo,box})=>{
      const storedReview=reviews.find(r=>r.annotation_id===box.id);
      const review=storedReview?.source_sha256===hashes[photo.id]?storedReview:undefined;
      const checks=regionReasons(data,photo,box,{annotation_id:box.id,decision:"accepted"});
      return <article key={box.id} className="review-region">
        <CropPreview photo={photo} box={box}/>
        <p>{data.birds.find(b=>b.id===box.birdId)?.name||box.birdId} · {t(box.side==="left"?"gauche":box.side==="right"?"droite":"côté inconnu")} · {photo.name}</p>
        <details><summary>{t("Voir la photo originale")}</summary><OriginalPreview photo={photo}/></details>
        <p>{t(review?.decision==="accepted"?"Acceptée":review?.decision==="rejected"?"Rejetée":"À examiner")}</p>
        {!!checks.length&&<p className="small">{t("Contrôles à compléter avant export Wild Me :")} {checks.map(code=>t(reasonLabels[code]||code)).join(", ")}</p>}
        <div className="cloudactions">{(["accepted","rejected"] as const).map(decision=><button key={decision} disabled={busy || (decision==="accepted" && !!checks.length)} onClick={async()=>{
          if(!client)return;setBusy(true);
          try{
            const {error}=await client.rpc("review_annotation",{target_owner:row.owner_id,expected_revision:row.revision,target_annotation:box.id,new_decision:decision,expected_sha256:hashes[photo.id]});
            if(error)throw error;
            const {data,error:readError}=await client.from("annotation_reviews").select("*").eq("owner_id",row.owner_id).eq("dataset_revision",row.revision);
            if(readError)throw readError;setReviews(data||[]);
          }catch{setError("Impossible d’enregistrer la revue. Actualisez les contributions et vérifiez vos droits.");}finally{setBusy(false);}
        }}>{t(decision==="accepted"?"Accepter cette région":"Rejeter cette région")}</button>)}</div>
      </article>;
    })}
  </section>;
}
function OriginalPreview({photo}:{photo:Photo}) {
  const [url,setUrl]=useState("");
  useEffect(()=>{const value=URL.createObjectURL(photo.blob);setUrl(value);return()=>URL.revokeObjectURL(value);},[photo.blob]);
  return <img className="review-original" src={url} alt=""/>;
}
