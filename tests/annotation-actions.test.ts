import {test} from "node:test";
import assert from "node:assert/strict";
import {resetAnnotationFrames,showPeriocularRegion} from "../lib/annotationActions";
import type {Photo,Box} from "../lib/dataset";
const box=(id:string,side:Box["side"],category:Box["category"]="periocular_region",birdId="a"):Box=>({id,category,side,birdId,bbox:[1,2,10,20]});
const photo:Photo={id:"photo",name:"",width:100,height:100,blob:new Blob(),capturedAt:"",sessionId:"",quality:"usable",birdId:"a",eyeLayout:"both",eyeVisible:"yes",regionBySide:{left:"yes",right:"no"},boxes:[box("left","left"),box("right","right"),box("eye","left","eye"),box("other","left","periocular_region","b")]};
test("drawing a region declares its side visible without inferring the other side",()=>{
 assert.deepEqual(showPeriocularRegion(photo,"right").regionBySide,{left:"yes",right:"yes"});
 assert.equal(showPeriocularRegion({...photo,eyeLayout:"left"},"left").regionVisible,"yes");
 assert.equal(showPeriocularRegion({...photo,regionBySide:{left:"partial"}},"left").regionBySide!.left,"partial");
});
test("reset all periocular frames clears visibility choices while preserving eyes and other animals",()=>{
 const patch=resetAnnotationFrames(photo,"periocular_region");
 assert.deepEqual(patch.boxes!.map(b=>b.id),["eye","other"]);
 assert.equal(patch.regionBySide,undefined);assert.equal(patch.regionVisible,undefined);
 assert.deepEqual(photo.regionBySide,{left:"yes",right:"no"});
});
test("side reset clears only that side's region choices and frames",()=>{
 const patch=resetAnnotationFrames(photo,"periocular_region","left");
 assert.deepEqual(patch.regionBySide,{right:"no"});
 assert.deepEqual(patch.boxes!.map(b=>b.id),["right","eye","other"]);
 assert.equal(resetAnnotationFrames(photo,"eye","left").regionBySide,undefined);
 assert.ok(!Object.hasOwn(resetAnnotationFrames(photo,"eye","left"),"regionBySide"));
});
