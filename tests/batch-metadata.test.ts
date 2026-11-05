import {test} from "node:test";
import assert from "node:assert/strict";
import {inheritBatchMetadata,rememberBatchMetadata} from "../lib/batchMetadata";
import {Dataset,Photo,removeBird} from "../lib/dataset";
function photo(id:string,patch:Partial<Photo>={}):Photo {
  return {id,name:id,blob:new Blob(),width:100,height:100,birdId:"ara",batchId:"batch",quality:"unreviewed",capturedAt:"",sessionId:"",boxes:[],...patch};
}
function dataset():Dataset{return {profile:"",consent:true,birds:[{id:"ara",name:"",species:""}],photos:[photo("a",{quality:"usable",capturedAt:"2026-11-05T12:40:45",sessionId:"Matin"}),photo("b"),photo("c",{capturedAt:"2026-11-04T09:00:00",sessionId:"EXIF session",metadataOrigin:{capturedAt:"exif"}}),photo("other",{birdId:"other",batchId:"other-batch"})]};}
test("carry date/session only within batch without copying quality or replacing existing metadata",()=>{
  const input=dataset(),remembered=rememberBatchMetadata(input,input.photos[0]);
  assert.equal(rememberBatchMetadata(remembered,input.photos[0]),remembered);
  const next=inheritBatchMetadata(remembered,"b");
  assert.equal(next.photos[1].capturedAt,input.photos[0].capturedAt);
  assert.equal(next.photos[1].sessionId,"Matin");
  assert.equal(next.photos[1].quality,"unreviewed");
  assert.deepEqual(next.photos[1].metadataOrigin,{capturedAt:"batch",sessionId:"batch"});
  assert.equal(inheritBatchMetadata(next,"c"),next);
  assert.equal(inheritBatchMetadata(next,"other"),next);
  assert.equal(input.photos[1].capturedAt,"");
  // These defaults are regular cloud JSON, not a separate browser draft cache.
  const restored={...next,batchMetadataDefaults:JSON.parse(JSON.stringify(next.batchMetadataDefaults))};
  restored.photos.push(photo("later"));
  assert.equal(inheritBatchMetadata(restored,"later").photos.at(-1)!.sessionId,"Matin");
});
test("explicit clearing stays unknown; completed photos are not changed on revisit",()=>{
  let input=dataset();input=rememberBatchMetadata(input,input.photos[0]);
  input.photos.push(photo("clear",{metadataOrigin:{capturedAt:"manual",sessionId:"manual"}}),photo("reviewed",{completed:true,doneSteps:[0,1,2,3,4,5]}),photo("quality-done",{doneSteps:[0]}));
  assert.equal(inheritBatchMetadata(input,"clear"),input);
  assert.equal(inheritBatchMetadata(input,"reviewed"),input);
  assert.equal(inheritBatchMetadata(input,"quality-done").photos.at(-1)!.sessionId,"Matin");
  const erased=rememberBatchMetadata(input,photo("a"));
  assert.equal(inheritBatchMetadata(erased,"b"),erased);
});
test("animal deletion removes defaults for emptied batches but preserves other batch defaults",()=>{
  const input=dataset();input.batchMetadataDefaults={batch:{capturedAt:"2026-11-05",sessionId:"Matin"},"other-batch":{capturedAt:"",sessionId:"Other"}};
  input.annotationResume={photoId:"a",step:2};
  assert.equal(removeBird(input,"ara").annotationResume,undefined);
  assert.deepEqual(removeBird(input,"ara").batchMetadataDefaults,{"other-batch":{capturedAt:"",sessionId:"Other"}});
});
