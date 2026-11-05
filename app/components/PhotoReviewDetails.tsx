"use client";
import {useState} from 'react';
import type {Dataset,Photo,Box} from '../../lib/dataset';
import {useI18n} from './I18n';
const colors={macaw:'#51e2c2',eye:'#ffcf47',periocular_region:'#ed7cff'};
export default function PhotoReviewDetails({photo,dataset,url}:{photo:Photo;dataset:Dataset;url:string}){
 const {t}=useI18n();const [focused,setFocused]=useState<string|null>(null);
 const box=photo.boxes.find(b=>b.id===focused);
 const category=(b:Box)=>t(b.category==='macaw'?'Corps':b.category==='eye'?'Œil':'Région périoculaire');
 const side=(b:Box)=>b.category==='macaw'?'—':t(b.side==='left'?'gauche':b.side==='right'?'droite':'Côté inconnu');
 const visibility=(b:Box)=>{
  const value=b.category==='macaw'?photo.bodyVisibility:b.category==='eye'?photo.eyeVisible:photo.regionBySide?.[b.side]??(photo.eyeLayout==='both'?undefined:photo.regionVisible);
  if(value==='full')return t('Entier');
  if(value==='partial')return t(b.category==='macaw'?'Partiellement hors cadre':'Partiellement visible');
  if(value==='yes')return t('Visible');
  if(value==='no'||value==='not_visible')return t('Non visible');
  return t('Je ne sais pas');
 };
 const sharpness=(b:Box)=>{
  if(b.category!=='periocular_region')return '—';
  if(b.sharpness)return t({sharp:'Net',blurry:'Flou',pixelated:'Pixelisé',unknown:'Je ne sais pas'}[b.sharpness]);
  return t(b.usability==='usable'?'Net':b.usability==='unusable'?'Inexploitable, cause non précisée':'Je ne sais pas');
 };
 const occlusion=(b:Box)=>b.category!=='periocular_region'?'—':t(b.occluded===true?'Partiellement masquée':b.occluded===false?'Aucune obstruction':'Je ne sais pas');
 const padding=box?Math.max(box.bbox[2],box.bbox[3])*.3:0;
 const x=box?Math.max(0,box.bbox[0]-padding):0,y=box?Math.max(0,box.bbox[1]-padding):0;
 const w=box?Math.max(1,Math.min(photo.width,box.bbox[0]+box.bbox[2]+padding)-x):photo.width;
 const h=box?Math.max(1,Math.min(photo.height,box.bbox[1]+box.bbox[3]+padding)-y):photo.height;
 const angles:Record<number,string>={0:'Face',45:'Trois-quarts droit',90:'Profil droit',135:'Arrière droit',180:'Dos',225:'Arrière gauche',270:'Profil gauche',315:'Trois-quarts gauche'};
 const viewpoint=photo.viewpoint?`${t(angles[photo.viewpoint.azimuth]??'Autre orientation')} · ${t(photo.viewpoint.elevation>0?'Au-dessus de l’ara':photo.viewpoint.elevation<0?'En dessous de l’ara':'À hauteur de l’ara')}`:t('Point de vue inconnu');
 const bird=dataset.birds.find(b=>b.id===photo.birdId);
 const body=photo.bodyVisibility==='full'?'Entier':photo.bodyVisibility==='partial'?'Partiellement hors cadre':photo.bodyVisibility==='not_visible'?'Non visible':'Je ne sais pas';
 const eye=photo.eyeVisible==='yes'?`${t('Visible')} · ${t(photo.eyeLayout==='both'?'Deux yeux':photo.eyeLayout==='left'?'gauche':photo.eyeLayout==='right'?'droite':'Côté inconnu')}`:t(photo.eyeVisible==='no'?'Non visible':'Je ne sais pas');
 return <>
  <div className="review-image-tools"><button type="button" aria-pressed={!box} onClick={()=>setFocused(null)}>{t('Vue complète')}</button>{box&&<span>{t('Zone {number} : {zone}',{number:photo.boxes.indexOf(box)+1,zone:category(box)})}</span>}</div>
  <svg className="review-photo-canvas" viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={t('Photo et cadres annotés')}>
   <image href={url} x="0" y="0" width={photo.width} height={photo.height} preserveAspectRatio="xMidYMid meet"/>
   {photo.boxes.filter(b=>!box||b.id===box.id).map(b=>{const index=photo.boxes.indexOf(b);return <g key={b.id} data-review-box={b.id}>
    <rect x={b.bbox[0]} y={b.bbox[1]} width={b.bbox[2]} height={b.bbox[3]} fill="none" stroke={colors[b.category]} strokeWidth={2} vectorEffect="non-scaling-stroke"/>
    <text x={b.bbox[0]} y={Math.max(14,b.bbox[1]-4)} fill="white" stroke="#172f27" strokeWidth={.5} paintOrder="stroke" fontSize={Math.max(w,h)/40}>{index+1}</text>
   </g>;})}
  </svg>
  <div className="review-legend">{(['macaw','eye','periocular_region'] as const).map(c=><span key={c}><i style={{background:colors[c]}}/>{t(c==='macaw'?'Corps':c==='eye'?'Œil':'Région périoculaire')}</span>)}</div>
  <dl className="photo-properties">{Object.entries({[t('Animal')]:bird?.name||t('Ara sans nom'),[t('Qualité')]:t(photo.quality==='usable'?'Nette et exploitable':photo.quality==='blurry'?'Flou':'À annoter'),[t('Corps')]:t(body),[t('Yeux visibles')]:eye,[t('Point de vue')]:viewpoint,[t('Date et séance')]:`${photo.capturedAt.replace('T',' ')||'—'} · ${photo.sessionId||t('Séance non renseignée')}`}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
  <p className="small">{t('Les côtés sont ceux de l’animal. Le tiret indique une information non applicable.')}</p>
  <div className="annotation-table-scroll"><table className="review-annotation-table"><caption>{t('Annotations à vérifier')}</caption><thead><tr>{['Zone','Côté','Visibilité','Netteté de la région','Masquage de la région'].map(label=><th scope="col" key={label}>{t(label)}</th>)}</tr></thead>
   <tbody>{photo.boxes.map((b,index)=><tr key={b.id} data-annotation-row={b.id}><th scope="row"><button type="button" aria-pressed={focused===b.id} onClick={()=>setFocused(focused===b.id?null:b.id)}><i style={{background:colors[b.category]}}/>{index+1}. {category(b)}</button></th><td>{side(b)}</td><td>{visibility(b)}</td><td>{sharpness(b)}</td><td>{occlusion(b)}</td></tr>)}</tbody></table></div>
  {!photo.boxes.length&&<p>{t('Aucun cadre pour cette photo.')}</p>}
  <details className="review-technical"><summary>{t('Détails techniques des cadres')}</summary><ol>{photo.boxes.map(b=><li key={b.id}>{category(b)} : {b.bbox.map(v=>Number(v.toFixed(2))).join(', ')} px</li>)}</ol><p>{t('Point de vue')} : {photo.viewpoint?`${photo.viewpoint.azimuth}° / ${photo.viewpoint.elevation}°`:'—'}</p></details>
 </>;
}
