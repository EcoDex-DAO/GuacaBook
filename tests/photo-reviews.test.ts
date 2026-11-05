import {test} from 'node:test';import assert from 'node:assert/strict';
import {approvedDataset,photoHash,photoSnapshot,birdsSnapshot,type PhotoReview} from '../lib/photoReviews';
import type {Dataset} from '../lib/dataset';
const dataset:Dataset={profile:'A',consent:true,birds:[{id:'a',name:'Ara',species:'Ara ararauna'}],photos:[{id:'p',birdId:'a',name:'test.png',width:100,height:100,blob:new Blob(['source'],{type:'image/png'}),quality:'usable',bodyVisibility:'not_visible',viewpoint:null,eyeVisible:'no',completed:true,capturedAt:'',sessionId:'',boxes:[]}]};
async function review():Promise<PhotoReview>{return {owner_id:'owner',photo_id:'p',dataset_revision:1,photo_snapshot:photoSnapshot(dataset.photos[0]),birds_snapshot:birdsSnapshot(dataset,dataset.photos[0]),source_sha256:await photoHash(dataset.photos[0]),decision:'accepted',reviewer_id:'independent',reviewed_at:'2026-11-05'};}
test('exports only independently approved, unchanged photos, including photos without periocular regions',async()=>{
 const accepted=await review(),map=new Map([['p',accepted]]);
 assert.equal((await approvedDataset(dataset,map)).photos.length,1);
 assert.equal((await approvedDataset(dataset,new Map())).photos.length,0);
 for(const decision of [{...accepted,decision:'rejected' as const},{...accepted,reviewer_id:'owner'},{...accepted,reviewer_id:null},{...accepted,source_sha256:'bad'}])assert.equal((await approvedDataset(dataset,new Map([['p',decision]]))).photos.length,0);
 assert.equal((await approvedDataset({...dataset,photos:[{...dataset.photos[0],bodyVisibility:'unknown'}]},map)).photos.length,0);
 assert.equal((await approvedDataset({...dataset,birds:[{...dataset.birds[0],species:'Other'}]},map)).photos.length,0);
 assert.equal((await approvedDataset({...dataset,photos:[{...dataset.photos[0],blob:new Blob(['replacement'])}]},map)).photos.length,0);
 assert.equal((await approvedDataset({...dataset,photos:[...dataset.photos,{...dataset.photos[0],id:'unapproved'}]},map)).photos.length,1);
});

test('the archive itself excludes pending sources, annotations and individuals by default',async()=>{
 const {buildV1Archive}=await import('../lib/v1Archive');
 const {zip,report}=await buildV1Archive(dataset);
 assert.equal(report.images,0);
 assert.equal(JSON.parse(await zip.file('annotations.json')!.async('string')).images.length,0);
 assert.equal(Object.keys(zip.files).some(path=>path.startsWith('images/')||path.startsWith('originals/')||path.startsWith('individuals/')),false);
 assert.equal((await zip.file('individuals.csv')!.async('string')).trimEnd().split('\r\n').length,1);
});
test('approved exports never request missing, unapproved originals',async()=>{
 const {loadReviewedDataset}=await import('../lib/photoReviews');
 const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
 const photo={...dataset.photos[0],id},data={...dataset,photos:[photo]};
 const review:PhotoReview={...await (async()=>({owner_id:owner,photo_id:id,dataset_revision:1,photo_snapshot:photoSnapshot(photo),birds_snapshot:birdsSnapshot(data,photo),source_sha256:await photoHash(photo),decision:'accepted' as const,reviewer_id:'independent',reviewed_at:'2026-11-05'}))()};
 const paths:string[]=[];
 const client={storage:{from:()=>({download:async(path:string)=>{paths.push(path);return {data:photo.blob,error:null};}})}} as unknown as import('@supabase/supabase-js').SupabaseClient;
 const row={owner_id:owner,revision:1,status:'draft' as const,updated_at:'',consented_at:null,dataset:{...data,photos:[{...photo,objectPath:`${owner}/${id}`,mimeType:'image/png'},{...photo,id:'missing',objectPath:'missing',mimeType:'image/png'}]}};
 const loaded=await loadReviewedDataset(client,row,new Map([[id,review]]));
 assert.deepEqual(paths,[`${owner}/${id}`]);assert.equal(loaded.photos.length,1);
});
