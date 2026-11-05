import { test } from "node:test";
import assert from "node:assert/strict";
import { Candidate, assignSplits, csv, regionReasons, safeId } from "../lib/v1";
import { Dataset } from "../lib/dataset";
function sample(id:string,identity="a",day="2026-01-01"): Candidate {
  const bird={id:identity,name:"",species:"Ara ararauna"};
  const box={id:`box-${id}`,birdId:identity,category:"periocular_region" as const,side:"left" as const,bbox:[0,0,10,10] as [number,number,number,number],usability:"usable" as const,occluded:false};
  const photo={id,name:`${id}.png`,width:100,height:100,blob:new Blob(),capturedAt:day,sessionId:day,quality:"usable" as const,completed:true,bodyVisibility:"not_visible" as const,eyeVisible:"no" as const,viewpoint:null,boxes:[box]};
  return {photo,box,bird,path:`${id}.png`,sha256:id};
}
test("V1 eligibility requires explicit quality, known side/identity, valid geometry and scientific review",()=>{
  const s=sample("1"),data:Dataset={profile:"",consent:true,birds:[s.bird],photos:[s.photo]};
  assert.deepEqual(regionReasons(data,s.photo,s.box,{annotation_id:s.box.id,decision:"accepted"}),[]);
  assert.ok(regionReasons(data,s.photo,s.box).includes("review_pending"));
  assert.ok(regionReasons(data,{...s.photo,quality:"blurry"},s.box).includes("photo_not_usable"));
  assert.ok(regionReasons(data,{...s.photo,regionBySide:{left:"partial"}},s.box,{annotation_id:s.box.id,decision:"accepted"}).includes("region_partial"));
  assert.ok(regionReasons(data,s.photo,{...s.box,occluded:null}).includes("occlusion_or_unknown"));
  assert.ok(regionReasons(data,s.photo,{...s.box,usability:undefined}).includes("region_not_usable"));
  assert.ok(regionReasons(data,s.photo,{...s.box,bbox:[90,0,20,20]}).includes("invalid_bbox"));
  assert.ok(regionReasons(data,s.photo,{...s.box,side:"unknown"}).includes("side_unknown"));
});
test("closed split groups all sides, dates, sessions and exact duplicates without leakage",()=>{
  const input=[1,2,3,4,5,6,7,8,9,10].map(i=>sample(String(i),"a",`2026-01-${String(i).padStart(2,"0")}`));
  input.push({...input[9],box:{...input[9].box,id:"right",side:"right"}});
  input.push({...sample("copy","a","2026-02-01"),sha256:"10"});
  const rows=assignSplits(input);
  assert.equal(new Set(rows.filter(r=>r.sha256==="10").map(r=>r.split_closed)).size,1);
  assert.equal(rows.at(-1)!.split_closed,rows.at(-2)!.split_closed);
  for(const key of ["sessionId","capturedAt"] as const){
    const groups=new Map<string,Set<string>>();
    for(const row of rows){const keyValue=row.photo[key];groups.set(keyValue,new Set([...(groups.get(keyValue)||[]),row.split_closed!]));}
    assert.ok([...groups.values()].every(s=>s.size===1));
  }
  assert.deepEqual(new Set(rows.map(r=>r.split_closed)),new Set(["train","valid","test"]));
  const reverse=assignSplits([...input].reverse());
  for(const row of rows)assert.equal(reverse.find(r=>r.box.id===row.box.id)!.split_closed,row.split_closed);
});
test("open split is identity-disjoint; undersized and undated data do not fabricate test sets",()=>{
  const input=Array.from({length:10},(_,i)=>sample(`image-${i}`,`bird-${i}`));
  input.push({...sample("extra","bird-0"),sha256:input[1].sha256});
  const rows=assignSplits(input);
  const byIdentity=new Map<string,Set<string>>();
  for(const row of rows)byIdentity.set(row.bird.id,new Set([...(byIdentity.get(row.bird.id)||[]),row.split_open!]));
  assert.ok([...byIdentity.values()].every(s=>s.size===1));
  assert.equal(rows[0].split_open,rows[1].split_open);
  assert.deepEqual(new Set(rows.map(r=>r.split_open)),new Set(["train","valid","test"]));
  assert.equal(assignSplits([sample("single")])[0].split_closed,"train");
  const missing=sample("unknown");missing.photo.capturedAt="";missing.photo.sessionId="";
  assert.equal(assignSplits([missing])[0].split_closed,"unsplit");
});
test("CSV preserves quoted values and nulls; IDs cannot traverse paths or collide with escapes",()=>{
  assert.equal(csv(["a","b"],[{a:'x,"y"\nz',b:null}]),'a,b\r\n"x,""y""\nz",\r\n');
  assert.notEqual(safeId("/"),safeId("%2F"));
  assert.notEqual(safeId(".."),"..");assert.ok(!safeId("a/b").includes("/"));
});
