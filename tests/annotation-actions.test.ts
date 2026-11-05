import {test} from "node:test";
import assert from "node:assert/strict";
import {resetAnnotationFrames,showPeriocularRegion,showAnnotationFrame,regionSharpness,hidePeriocularRegion} from "../lib/annotationActions";
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
 const eyeReset=resetAnnotationFrames(photo,"eye","left");
 assert.deepEqual(eyeReset.regionBySide,{right:"no"});
 assert.ok(!Object.hasOwn(eyeReset,"eyeVisible"));
});

test("body drawing defaults to full, preserves partial, and reset clears only body answers",()=>{
 assert.equal(showAnnotationFrame(photo,"macaw","unknown").bodyVisibility,"full");
 assert.equal(showAnnotationFrame({...photo,bodyVisibility:"partial"},"macaw","unknown").bodyVisibility,"partial");
 const reset=resetAnnotationFrames({...photo,bodyVisibility:"full",boxes:[...photo.boxes,box("body","unknown","macaw")]},"macaw");
 assert.equal(reset.bodyVisibility,undefined);assert.ok(!Object.hasOwn(reset,"eyeVisible"));
 assert.deepEqual(reset.boxes,photo.boxes);
});
test("eye drawing confirms visibility without inventing laterality; full reset clears dependent regions",()=>{
 assert.deepEqual(showAnnotationFrame({...photo,eyeLayout:undefined,eyeVisible:undefined},"eye","unknown"),{eyeVisible:"yes",eyeLayout:"unknown"});
 assert.deepEqual(showAnnotationFrame(photo,"eye","right"),{eyeVisible:"yes",eyeLayout:"both"});
 const reset=resetAnnotationFrames(photo,"eye");
 assert.equal(reset.eyeVisible,undefined);assert.equal(reset.eyeLayout,undefined);
 assert.equal(reset.regionBySide,undefined);assert.equal(reset.regionVisible,undefined);
 assert.deepEqual(reset.boxes!.map(b=>b.id),["other"]);
});

test("keeps blur and pixelation distinct and maps them conservatively to legacy usability",()=>{
 assert.deepEqual(regionSharpness("sharp"),{sharpness:"sharp",usability:"usable"});
 assert.deepEqual(regionSharpness("blurry"),{sharpness:"blurry",usability:"unusable"});
 assert.deepEqual(regionSharpness("pixelated"),{sharpness:"pixelated",usability:"unusable"});
 assert.deepEqual(regionSharpness("unknown"),{sharpness:"unknown",usability:"unknown"});
});
test("hiding a region removes only its own frames and preserves eyes, other side and other animals",()=>{
 const result={...photo,...hidePeriocularRegion(photo,"left")};
 assert.equal(result.regionBySide!.left,"no");assert.equal(result.regionBySide!.right,"no");
 assert.deepEqual(result.boxes.map(b=>b.id),["right","eye","other"]);
 assert.equal(result.eyeVisible,"yes");assert.equal(result.eyeLayout,"both");
});
