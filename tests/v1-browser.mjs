import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { readFile, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { A, rows, objects, setup, signIn, annotationReviews } from "./supabase-mock.mjs";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });
try {
  const page=await browser.newPage({locale:"fr-FR"});page.setDefaultTimeout(20000);
  const png=await setup(page);
  const jpeg=Buffer.from(await page.evaluate(()=>{
    const c=document.createElement("canvas");c.width=400;c.height=300;const ctx=c.getContext("2d");
    ctx.fillStyle="red";ctx.fillRect(0,0,200,300);ctx.fillStyle="blue";ctx.fillRect(200,0,200,300);
    return c.toDataURL("image/jpeg",0.98).split(",")[1];
  }),"base64");
  const tiff=Buffer.alloc(26);tiff.write("II");tiff.writeUInt16LE(42,2);tiff.writeUInt32LE(8,4);tiff.writeUInt16LE(1,8);
  tiff.writeUInt16LE(0x112,10);tiff.writeUInt16LE(3,12);tiff.writeUInt32LE(1,14);tiff.writeUInt16LE(6,18);
  const exif=Buffer.concat([Buffer.from("Exif\0\0"),tiff]);const marker=Buffer.alloc(4);marker[0]=255;marker[1]=225;marker.writeUInt16BE(exif.length+2,2);
  const oriented=Buffer.concat([jpeg.subarray(0,2),marker,exif,jpeg.subarray(2)]);
  const photoId="33333333-3333-4333-8333-333333333333", blurryId="44444444-4444-4444-8444-444444444444";
  const box=(id,category,side,bbox)=>({id,category,side,bbox,birdId:"bird",usability:"usable",occluded:false});
  const photo={id:photoId,name:"rotated.jpg",width:300,height:400,objectPath:`${A}/${photoId}`,mimeType:"image/jpeg",capturedAt:"2026-01-02T10:00:00",sessionId:"session-1",batchId:"batch-1",birdId:"bird",annotationVersion:1,
    quality:"usable",completed:true,viewpoint:{azimuth:90,elevation:0},bodyVisibility:"not_visible",eyeVisible:"yes",eyeLayout:"both",regionBySide:{left:"yes",right:"yes"},boxes:[
      box("eye-left","eye","left",[15,15,5,5]),box("eye-right","eye","right",[15,255,5,5]),
      box("region-left","periocular_region","left",[10.2,10.4,50.1,40.2]),box("region-right","periocular_region","right",[10,250,50,40]),
    ]};
  rows.set(A,{owner_id:A,revision:1,status:"submitted",consented_at:new Date().toISOString(),dataset:{profile:"Reviewer",consent:true,researchConsent:{version:"guacabook-research-v1",acceptedAt:new Date().toISOString()},birds:[{id:"bird",name:"Kiwi",species:"Ara ararauna"}],photos:[photo,
    {...photo,id:blurryId,name:"blurry.png",objectPath:`${A}/${blurryId}`,mimeType:"image/png",width:400,height:300,quality:"blurry",eyeLayout:"left",regionBySide:{left:"yes"},boxes:[box("eye-blur","eye","left",[20,20,5,5]),box("region-blur","periocular_region","left",[10,10,50,40])]},
  ]}});
  objects.set(photo.objectPath,oriented);objects.set(`${A}/${blurryId}`,Buffer.from(png,"base64"));
  await page.goto(process.env.TEST_BASE_URL||"http://localhost:3000");await signIn(page);
  await page.getByText("Administration des contributions",{exact:true}).click();
  await page.getByRole("button",{name:"Actualiser les contributions",exact:true}).click();
  await page.getByRole("button",{name:"Examiner les régions",exact:true}).click();
  await page.getByRole("heading",{name:"Revue des régions périoculaires",exact:true}).waitFor();
  const reviewRegions=page.locator(".review-region");
  assert.equal(await reviewRegions.count(),3);
  assert.equal(await reviewRegions.nth(2).getByRole("button",{name:"Accepter cette région",exact:true}).isDisabled(),true);
  for(let i=0;i<2;i++) {
    await reviewRegions.nth(i).getByRole("button",{name:"Accepter cette région",exact:true}).click();
    await reviewRegions.nth(i).getByText("Acceptée",{exact:true}).waitFor();
  }
  assert.equal(annotationReviews.size,2);
  async function exportZip(){const pending=page.waitForEvent("download");await page.getByRole("button",{name:"Exporter V1 (COCO + Wild Me)",exact:true}).click();const download=await pending;return JSZip.loadAsync(await readFile(await download.path()));}
  const zip=await exportZip();
  const coco=JSON.parse(await zip.file("annotations.json").async("string")), report=JSON.parse(await zip.file("report.json").async("string"));
  const version=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8")).version;
  assert.equal(report.version,version);assert.equal(coco.info.version,version);
  assert.equal(await page.getByTestId("app-version").innerText(),`v${version}`);
  assert.equal(coco.images.length,2);assert.equal(report.eligible_regions,2);assert.equal(report.excluded_regions,1);
  assert.equal(coco.guacabook.schema_version,3);assert.equal(coco.guacabook.crops.length,3);
  assert.equal(report.split_closed.train,2);assert.equal(report.split_closed.test,0);
  for(const image of coco.images)assert.ok(zip.file(image.file_name));
  const first=coco.images[0];
  assert.equal(first.width,300);assert.equal(first.height,400);
  assert.equal(first.guacabook.sha256,createHash("sha256").update(oriented).digest("hex"));
  assert.deepEqual(await zip.file(first.guacabook.original_file).async("nodebuffer"),oriented);
  const left=coco.guacabook.crops.find(c=>c.annotation_id.endsWith("region-left"));
  assert.deepEqual(left.source_bbox,[10,10,51,41]);
  const pixels=await page.evaluate(async base64=>{
    const response=await fetch("data:image/png;base64,"+base64),blob=await response.blob(),bitmap=await createImageBitmap(blob);
    const c=document.createElement("canvas");c.width=bitmap.width;c.height=bitmap.height;c.getContext("2d").drawImage(bitmap,0,0);
    const result={width:bitmap.width,height:bitmap.height,pixel:[...c.getContext("2d").getImageData(5,5,1,1).data]};bitmap.close();return result;
  },await zip.file(left.crop_file).async("base64"));
  assert.equal(pixels.width,51);assert.equal(pixels.height,41);assert.ok(pixels.pixel[0]>200 && pixels.pixel[2]<50);
  assert.ok((await zip.file("regions.csv").async("string")).includes("photo_not_usable"));
  // Execute the exported, standard-library-only adapter on a real extracted archive.
  const directory=await mkdtemp(join(tmpdir(),"guacabook-v1-"));
  for(const entry of Object.values(zip.files)){if(entry.dir)continue;const target=join(directory,entry.name);await mkdir(join(target,".."),{recursive:true});await writeFile(target,await entry.async("nodebuffer"));}
  const output=execFileSync("python3",[join(directory,"wildme/prepare.py"),directory,"--protocol","closed"],{encoding:"utf8"});
  assert.match(output,/train 2/);
  const check=execFileSync("python3",["-c",`import csv,pathlib,sys
r=list(csv.DictReader(open(sys.argv[1])))
assert len(r)==2
for x in r:
 assert pathlib.Path(x['file_path']).is_file()
 assert x['theta']=='0' and x['x']=='0' and x['y']=='0'
 assert x['viewpoint'] in ['left','right']
 assert x['species']=='Ara ararauna'
print('adapter-ok')`,join(directory,"wildme/closed/train.csv")],{encoding:"utf8"});
  assert.match(check,/adapter-ok/);
  // Replacing stored bytes under the same ID/revision must also invalidate review.
  const changed=Buffer.concat([oriented,Buffer.from("changed")]);objects.set(photo.objectPath,changed);
  const changedZip=await exportZip();
  assert.equal(JSON.parse(await changedZip.file("report.json").async("string")).eligible_regions,0);
  assert.ok((await changedZip.file("regions.csv").async("string")).includes("source_changed_since_review"));
  objects.set(photo.objectPath,oriented);
  // A newer contributor revision must not inherit previous review decisions.
  rows.get(A).revision++;
  const stale=await exportZip();
  assert.equal(JSON.parse(await stale.file("report.json").async("string")).eligible_regions,0);
  console.log("PASS: review eligibility, stale-review rejection, generic + MiewID archive, EXIF-oriented pixels, crop provenance, Python CSV adapter and empty test partitions (simulated API).");
} finally {await browser.close();}
