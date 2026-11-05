import type {Dataset,Photo} from './dataset';
import {stepValid} from './dataset';
export type PhotoReview={owner_id:string;photo_id:string;dataset_revision:number;photo_snapshot:unknown;birds_snapshot:unknown;source_sha256:string;decision:'accepted'|'rejected';reviewer_id:string|null;reviewed_at:string};
function canonical(value:unknown):string {
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 if(value&&typeof value==='object')return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')}}`;
 return JSON.stringify(value);
}
export function photoSnapshot(photo:Photo):unknown {
 const result={...photo} as Record<string,unknown>;
 for(const key of ['blob','name','objectPath','mimeType'])delete result[key];
 return result;
}
export function birdsSnapshot(data:Dataset,photo:Photo) {
 const ids=new Set([photo.birdId,...photo.boxes.map(b=>b.birdId)]);
 return data.birds.filter(b=>ids.has(b.id)).slice().sort((a,b)=>a.id.localeCompare(b.id));
}
export async function photoHash(photo:Photo) {
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await photo.blob.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function currentPhotoReview(data:Dataset,photo:Photo,review:PhotoReview|undefined,hash?:string) {
 return !!review&&!!review.reviewer_id&&review.reviewer_id!==review.owner_id&&
 canonical(review.photo_snapshot)===canonical(photoSnapshot(photo))&&canonical(review.birds_snapshot)===canonical(birdsSnapshot(data,photo))&&
 (hash===undefined||hash===review.source_sha256);
}
export async function approvedDataset(data:Dataset,reviews:Map<string,PhotoReview>) {
 const photos:Photo[]=[];
 for(const photo of data.photos){const review=reviews.get(photo.id);
  if(review?.decision==='accepted'&&photo.completed&&stepValid(photo,5)&&currentPhotoReview(data,photo,review,await photoHash(photo)))photos.push(photo);
 }
 const ids=new Set(photos.flatMap(photo=>[photo.birdId,...photo.boxes.map(box=>box.birdId)]));
 return {...data,photos,birds:data.birds.filter(bird=>ids.has(bird.id))};
}

// Do not fetch pending/rejected originals: a missing draft must not block an approved export.
export async function loadReviewedDataset(client:import('@supabase/supabase-js').SupabaseClient,row:import('./cloud').CloudRow,reviews:Map<string,PhotoReview>) {
 const {loadCloudDataset}=await import('./cloud');
 const dataset:Dataset={...row.dataset,photos:row.dataset.photos.map(photo=>({...photo,blob:new Blob()}))};
 const candidates=new Set(dataset.photos.filter(photo=>{
  const review=reviews.get(photo.id);
  return review?.decision==='accepted'&&photo.completed&&stepValid(photo,5)&&currentPhotoReview(dataset,photo,review);
 }).map(photo=>photo.id));
 return loadCloudDataset(client,{...row,dataset:{...row.dataset,photos:row.dataset.photos.filter(photo=>candidates.has(photo.id))}});
}
