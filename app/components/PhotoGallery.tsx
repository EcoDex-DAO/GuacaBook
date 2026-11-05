"use client";
import {useEffect,useState} from 'react';
import {useAccount} from './AccountGate';
import {useI18n} from './I18n';
import {loadCloudDataset,type CloudRow} from '../../lib/cloud';
import type {Dataset,Photo} from '../../lib/dataset';
import {stepValid} from '../../lib/dataset';
import {validBox} from '../../lib/v1';
import {currentPhotoReview,photoHash,type PhotoReview} from '../../lib/photoReviews';
function storedDataset(row:CloudRow):Dataset{return {...row.dataset,photos:row.dataset.photos.map(p=>({...p,blob:new Blob()}))};}
export default function PhotoGallery({onEdit}:{onEdit:(photo:Photo)=>void}){
 const {client,user,account}=useAccount(),{t}=useI18n();
 const [rows,setRows]=useState<CloudRow[]>([]),[reviews,setReviews]=useState<PhotoReview[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[page,setPage]=useState(0),[selected,setSelected]=useState('');
 const [detail,setDetail]=useState<{dataset:Dataset;photo:Photo;hash:string;url:string}|null>(null);
 async function refresh(){
  if(!client)return;setBusy(true);setError('');
  try{
   const result:CloudRow[]=[];
   for(let offset=0;;offset+=100){const {data,error}=await client.from('contributor_datasets').select('*').order('owner_id').range(offset,offset+99);if(error)throw error;result.push(...data||[]);if((data||[]).length<100)break;}
   const decisions:PhotoReview[]=[];
   for(let offset=0;;offset+=100){const {data,error}=await client.from('photo_reviews').select('*').order('owner_id').order('photo_id').range(offset,offset+99);if(error)throw error;decisions.push(...data||[]);if((data||[]).length<100)break;}
   setRows(result);setReviews(decisions);
  }catch{setError('Galerie indisponible. Appliquez la migration 005 dans Supabase, puis actualisez.');}finally{setBusy(false);}
 }
 useEffect(()=>{void refresh();},[client]);
 const items=rows.flatMap(row=>row.dataset.photos.map(photo=>({row,photo,key:`${row.owner_id}:${photo.id}`})));
 const selectedItem=items.find(item=>item.key===selected);
 useEffect(()=>{
  setDetail(null);if(!client||!selectedItem)return;
  let live=true,url='';const row=selectedItem.row,id=selectedItem.photo.id;
  void loadCloudDataset(client,{...row,dataset:{...row.dataset,photos:row.dataset.photos.filter(p=>p.id===id)}}).then(async dataset=>{
   const photo=dataset.photos[0],hash=await photoHash(photo);if(!live)return;
   url=URL.createObjectURL(photo.blob);setDetail({dataset,photo,hash,url});
  }).catch(()=>{if(live)setError('Impossible de charger cette photo. Actualisez la galerie.');});
  return()=>{live=false;if(url)URL.revokeObjectURL(url);};
 },[client,selectedItem?.row,selectedItem?.photo.id]);
 function decision(row:CloudRow,photo:Photo){
  const review=reviews.find(r=>r.owner_id===row.owner_id&&r.photo_id===photo.id);
  const dataset=storedDataset(row);
  return currentPhotoReview(dataset,photo,review)?review:undefined;
 }
 const filtered=items.filter(({row,photo})=>{
  const state=decision(row,{...photo,blob:new Blob()})?.decision??'pending';
  return (filter==='all'||state===filter)&&`${photo.name} ${row.dataset.profile}`.toLowerCase().includes(search.toLowerCase());
 });
 const states={accepted:'Validée par un vérificateur',rejected:'À corriger',pending:'En attente de vérification'};
 async function reviewPhoto(value:'accepted'|'rejected'){
  if(!client||!detail||!selectedItem)return;setBusy(true);setError('');
  try{
   const {error}=await client.rpc('review_photo',{target_owner:selectedItem.row.owner_id,expected_revision:selectedItem.row.revision,target_photo:detail.photo.id,new_decision:value,expected_sha256:detail.hash});
   if(error)throw error;await refresh();
  }catch{setError('Validation impossible. La contribution a peut-être changé : actualisez avant de réessayer.');}finally{setBusy(false);}
 }
 const labels:Record<string,string>={usable:'Nette et exploitable',unusable:'Inexploitable',unreviewed:'À annoter',blurry:'Flou',sharp:'Net',pixelated:'Pixelisé',unknown:'Je ne sais pas',full:'Entier',partial:'Partiellement',not_visible:'Non visible',yes:'Oui',no:'Non',left:'gauche',right:'droite',both:'Deux yeux'};
 const label=(value:string|undefined)=>t(labels[value??'unknown']??value??'Je ne sais pas');
 const own=selectedItem?.row.owner_id===user?.id;
 const storedReview=selectedItem&&detail?decision(selectedItem.row,detail.photo):undefined;
 const currentReview=detail&&storedReview?.source_sha256===detail.hash?storedReview:undefined;
 return <section className="photo-gallery">
  <h1>{t('Photos et validation')}</h1>
  <p>{t(account?.can_review_data?'Consultez les contributions et vérifiez les annotations avant leur ajout au dataset.':'Retrouvez vos photos, leur état de validation et vos annotations.')}</p>
  <div className="gallery-tools">
   <label>{t('Rechercher une photo')}<input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label>
   <label>{t('État de validation')}<select value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value="all">{t('Toutes les photos')}</option>{Object.entries(states).map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></label>
   <button disabled={busy} onClick={()=>void refresh()}>{t('Actualiser la galerie')}</button>
  </div>
  {error&&<p role="alert">{t(error)}</p>}
  {busy&&<p role="status">{t('Chargement…')}</p>}
  <div className="gallery-grid">{filtered.slice(page*12,page*12+12).map(({row,photo,key})=><button key={key} className="gallery-card" aria-pressed={selected===key} onClick={()=>setSelected(key)}>
    <Thumbnail row={row} photoId={photo.id}/><strong>{photo.name}</strong><span>{row.dataset.profile||row.owner_id}</span><small>{t(states[decision(row,{...photo,blob:new Blob()})?.decision??'pending'])}</small>
  </button>)}</div>
  {!busy&&!filtered.length&&<p>{t('Aucune photo à afficher.')}</p>}
  <div className="gallery-pagination"><button disabled={page===0} onClick={()=>setPage(page-1)}>{t('Page précédente')}</button><span>{page+1} / {Math.max(1,Math.ceil(filtered.length/12))}</span><button disabled={(page+1)*12>=filtered.length} onClick={()=>setPage(page+1)}>{t('Page suivante')}</button></div>
  {detail&&selectedItem&&<article className="photo-detail">
   <h2>{detail.photo.name}</h2><p>{t(states[currentReview?.decision??'pending'])}</p>
   <svg className="review-photo-canvas" viewBox={`0 0 ${detail.photo.width} ${detail.photo.height}`} role="img" aria-label={t('Photo et cadres annotés')}>
    <image href={detail.url} width={detail.photo.width} height={detail.photo.height}/>
    {detail.photo.boxes.map((box,index)=><g key={box.id}><rect x={box.bbox[0]} y={box.bbox[1]} width={box.bbox[2]} height={box.bbox[3]} fill="none" stroke={box.category==='eye'?'#ffcf47':box.category==='macaw'?'#51e2c2':'#ed7cff'} strokeWidth={2} vectorEffect="non-scaling-stroke"/><text x={box.bbox[0]} y={Math.max(14,box.bbox[1]-4)} fill="white" fontSize={Math.max(12,detail.photo.width/70)}>{index+1}</text></g>)}
   </svg>
   <dl className="photo-properties">{Object.entries({[t('Animal')]:detail.dataset.birds.find(b=>b.id===detail.photo.birdId)?.name||detail.photo.birdId||'—',[t('Qualité')]:label(detail.photo.quality),[t('Corps')]:label(detail.photo.bodyVisibility),[t('Yeux visibles')]:`${label(detail.photo.eyeVisible)} · ${label(detail.photo.eyeLayout)}`,[t('Point de vue')]:detail.photo.viewpoint?`${detail.photo.viewpoint.azimuth}° / ${detail.photo.viewpoint.elevation}°`:t('Je ne sais pas'),[t('Date et séance')]:`${detail.photo.capturedAt||'—'} · ${detail.photo.sessionId||'—'}`}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
   <ol>{detail.photo.boxes.map(box=><li key={box.id}>{t(box.category==='macaw'?'Corps':box.category==='eye'?'Œil':'Région périoculaire')} · {label(box.side)} · {box.bbox.join(', ')}{box.category==='periocular_region'&&` · ${label(detail.photo.regionBySide?.[box.side]??detail.photo.regionVisible)} · ${label(box.sharpness??box.usability)} · ${t('Masquage de la région')}: ${box.occluded===true?t('Partiellement'):box.occluded===false?t('Complètement visible'):t('Je ne sais pas')}`}</li>)}</ol>
   {own&&<button onClick={()=>onEdit(detail.photo)}>{t('Revérifier mes annotations')}</button>}
   {account?.can_review_data&&!own&&<div className="cloudactions"><button className="primary" disabled={busy||!detail.photo.completed||!stepValid(detail.photo,5)||detail.photo.boxes.some(box=>!validBox(detail.photo,box))} onClick={()=>void reviewPhoto('accepted')}>{t('Valider cette photo pour le dataset')}</button><button disabled={busy} onClick={()=>void reviewPhoto('rejected')}>{t('Demander une correction')}</button></div>}
   {account?.can_review_data&&own&&<p className="small">{t('Vos propres photos doivent être validées par un autre vérificateur.')}</p>}
  </article>}
 </section>;
}
function Thumbnail({row,photoId}:{row:CloudRow;photoId:string}){
 const {client}=useAccount();const [url,setUrl]=useState('');
 useEffect(()=>{if(!client)return;let live=true,objectUrl='';void loadCloudDataset(client,{...row,dataset:{...row.dataset,photos:row.dataset.photos.filter(p=>p.id===photoId)}}).then(dataset=>{if(live){objectUrl=URL.createObjectURL(dataset.photos[0].blob);setUrl(objectUrl);}}).catch(()=>{});return()=>{live=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[client,row,photoId]);
 return url?<img src={url} alt=""/>:<span>…</span>;
}
