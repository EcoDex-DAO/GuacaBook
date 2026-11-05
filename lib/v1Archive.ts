import { APP_VERSION } from "./version";
import JSZip from "jszip";
import { coco, Dataset } from "./dataset";
import { assignSplits, Candidate, csv, regionReasons, Review, safeId, validBox } from "./v1";
export const PREPARE_MIEW = `import argparse, csv
from pathlib import Path
parser = argparse.ArgumentParser(description="Resolve GuacaBook crop paths for MiewID")
parser.add_argument("root", type=Path)
parser.add_argument("--protocol", choices=["closed", "open"], default="closed")
a = parser.parse_args()
root = a.root.resolve()
with (root / "wildme/metadata.csv").open(newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    fields = reader.fieldnames
    rows = list(reader)
for row in rows:
    path = (root / row["file_path"]).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError("Missing or unsafe crop path: " + row["file_path"])
    row["file_path"] = str(path)
out = root / "wildme" / a.protocol
out.mkdir(parents=True, exist_ok=True)
for split in ["train", "valid", "test", "unsplit"]:
    selected = [r for r in rows if r["split_" + a.protocol] == split]
    with (out / (split + ".csv")).open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(selected)
    print(split, len(selected))
`;
const instructions = `GuacaBook V1 — schema 3 — CC BY 4.0 for authorized contributions.
annotations.json is generic bbox-only COCO, with GuacaBook extensions.
images/ contains lossless PNG originals normalized using EXIF orientation. All COCO coordinates refer to those decoded pixels.
originals/ preserves uploaded bytes; these files may retain private EXIF metadata. sha256 is the hash of those bytes.
individuals/<identity>/<anatomical-side>/ contains periocular PNG crops, never resized. Unknown identity/side is explicit.
Each crop is linked to its normalized image, uploaded original, numeric COCO annotation and stable annotation ID in crops.csv and annotations.json guacabook.crops.
metadata.csv is per image; regions.csv documents every periocular region, including exclusion reasons. Empty dates/unknowns are never guessed.
wildme/metadata.csv targets the documented MiewID CSV interface: theta,viewpoint,name,file_name,species,file_path,x,y,w,h. It contains only completed, sharp, identified, known-side, usable, non-occluded, explicitly reviewed/accepted regions. Duplicate crops are excluded, and conflicting identities on identical regions are withheld.
viewpoint means anatomical periocular side (left/right) for this task, not a WBIA global body-orientation label. Camera azimuth/elevation are separate fields. theta=0 because these crops are axis-aligned; it is NOT camera azimuth.
Run: python wildme/prepare.py /absolute/path/to/extracted/archive --protocol closed
This writes CSV files with absolute file_path under wildme/closed/. Use --protocol open for identity-disjoint sets. Use the MiewID configuration corresponding to your installed version, pointing to these CSV files.
Closed: same image, identical original hash, individual/session and individual/day never cross partitions. Per-individual groups are ordered by capture time (session/ID fallback when dates unknown), approximately 70/15/15. Shared groups favor train, then valid, then test. Fewer than 3 groups stay in train.
Open: disjoint identity components, keeping co-occurring/duplicate-image identities together, approximately 70/15/15. Fewer than 3 components stay in train. Ordering is deterministic by stable IDs.
Groups lacking both session and capture date are unsplit. Missing partitions and tiny cohorts are reported; no performance claim is made. Gallery/query protocol and rejection thresholds must still be configured and evaluated for macaws.
Exact byte duplicates are detected. Re-encoded/near-duplicate photos and cross-account identity reconciliation still require human review. Left and right are NOT separate individual identities.
No segmentation masks or AI identifications are generated. Annotated V0 data remains generic; missing V1 region checks or review prevents training eligibility.
MiewID/WBIA code and model weights must be installed and licensed separately. This export is not a ready-to-import Wildbook database.
`;
function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("PNG export failed")),"image/png"));
}
export async function buildV1Archive(data: Dataset, reviews: Map<string,Review> = new Map()) {
  if(!data.consent)throw new Error("Autorisation requise avant export.");
  const identifiers=[...data.photos.map(p=>p.id),...data.photos.flatMap(p=>p.boxes.map(b=>b.id))];
  if(identifiers.some(id=>typeof id!=="string" || !id || id.length>120) || new Set(identifiers).size!==identifiers.length || new Set(data.birds.map(b=>b.id)).size!==data.birds.length)throw new Error("Invalid or duplicate identifiers");
  const zip=new JSZip(), document=coco(data);
  const imageRows:Record<string,unknown>[]=[], regionRows:Record<string,unknown>[]=[], cropRows:Record<string,unknown>[]=[];
  const candidates:Candidate[]=[], cropLinks:Record<string,unknown>[]=[];
  let annotationOffset=0;
  for(let i=0;i<data.photos.length;i++) {
    const photo=data.photos[i], original=`originals/${safeId(photo.id)}/upload.${photo.blob.type === "image/jpeg" ? "jpg" : photo.blob.type === "image/webp" ? "webp" : "png"}`;
    const sha256=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await photo.blob.arrayBuffer()))).map(b=>b.toString(16).padStart(2,"0")).join("");
    zip.file(original,photo.blob);
    if(photo.boxes.some(box=>!validBox(photo,box)))throw new Error("Cadre hors image ou invalide");
    const bitmap=await createImageBitmap(photo.blob,{imageOrientation:"from-image"});
    try {
      if(bitmap.width!==photo.width || bitmap.height!==photo.height)throw new Error("Image dimensions differ from annotations");
      const canvas=window.document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;
      const context=canvas.getContext("2d");if(!context)throw new Error("Canvas unavailable");
      context.drawImage(bitmap,0,0);
      const path=`images/${safeId(photo.birdId || "unassigned")}/${safeId(photo.id)}.png`;
      zip.file(path,await png(canvas)); document.images[i].file_name=path;
      Object.assign(document.images[i].guacabook,{original_file:original,sha256});
      imageRows.push({id:photo.id,width:photo.width,height:photo.height,file_name:path,identity:document.images[i].identity,
        identities:[...new Set(photo.boxes.map(b=>b.birdId).filter(Boolean).concat(photo.birdId || []))],timestamp:photo.capturedAt || null,date:photo.capturedAt.slice(0,10)||null,
        metadata_origin:photo.metadataOrigin??null,session_id:photo.sessionId||null,batch_id:photo.batchId||null,quality:photo.quality,annotation_status:photo.completed?"complete":"draft",original_file:original,sha256});
      for(let j=0;j<photo.boxes.length;j++) {
        const box=photo.boxes[j];
        if(box.category!=="periocular_region")continue;
        const review=reviews.get(box.id), reasons=regionReasons(data,photo,box,review);
        const row:Record<string,unknown>={annotation_id:box.id,coco_annotation_id:annotationOffset+j+1,image_id:photo.id,identity:box.birdId||null,side:box.side,
          visibility:photo.regionBySide?.[box.side]??(photo.eyeLayout==="both"?null:photo.regionVisible??null),usability:box.usability||"unknown",occluded:box.occluded??null,review:review?.decision||"pending",reviewer_id:review?.reviewer_id||null,
          reviewed_at:review?.reviewed_at||null,review_revision:review?.dataset_revision??null,exclusion_reasons:reasons.join(";"),bbox:box.bbox};
        if(review?.decision==="accepted" && review.source_sha256!==sha256) {
          reasons.push("source_changed_since_review");row.exclusion_reasons=reasons.join(";");
        }
        regionRows.push(row);
        if(!validBox(photo,box))continue;
        const [x,y,w,h]=box.bbox, sx=Math.floor(x),sy=Math.floor(y),sw=Math.ceil(x+w)-sx,sh=Math.ceil(y+h)-sy;
        const crop=window.document.createElement("canvas");crop.width=sw;crop.height=sh;
        const ctx=crop.getContext("2d");if(!ctx)throw new Error("Canvas unavailable");
        ctx.drawImage(bitmap,sx,sy,sw,sh,0,0,sw,sh);
        const file=`individuals/${safeId(box.birdId||"unassigned")}/${box.side}/${safeId(photo.id)}-${safeId(box.id)}.png`;
        zip.file(file,await png(crop));
        const link={crop_file:file,image_id:photo.id,coco_image_id:i+1,annotation_id:box.id,coco_annotation_id:annotationOffset+j+1,
          identity:box.birdId||null,side:box.side,source_file:path,original_file:original,source_bbox:[sx,sy,sw,sh],width:sw,height:sh,sha256};
        cropRows.push(link);cropLinks.push(link);row.crop_file=file;
        if(!reasons.length)candidates.push({photo,box,bird:data.birds.find(b=>b.id===box.birdId)!,path:file,sha256});
      }
      canvas.width=0;canvas.height=0;
    } finally {bitmap.close();}
    annotationOffset+=photo.boxes.length;
  }
  const exact=new Map<string,Candidate[]>();
  for(const row of candidates){const key=JSON.stringify([row.sha256,row.box.bbox,row.box.side]);exact.set(key,[...(exact.get(key)||[]),row]);}
  const excluded=new Map<string,string>();
  for(const rows of exact.values()) {
    const identities=new Set(rows.map(row=>row.bird.id));
    if(identities.size>1)rows.forEach(row=>excluded.set(row.box.id,"conflicting_identity_on_identical_region"));
    else rows.slice().sort((a,b)=>a.box.id.localeCompare(b.box.id)).slice(1).forEach(row=>excluded.set(row.box.id,"duplicate_region"));
  }
  regionRows.forEach(row=>{if(excluded.has(String(row.annotation_id)))row.exclusion_reasons=excluded.get(String(row.annotation_id));});
  const samples=assignSplits(candidates.filter(row=>!excluded.has(row.box.id)));
  const wildme=samples.map(row=>{
    const crop=cropRows.find(c=>c.annotation_id===row.box.id)!;
    return {theta:0,viewpoint:row.box.side,name:row.bird.id,file_name:row.path.split("/").at(-1),species:row.bird.species||"unknown",file_path:row.path,
      x:0,y:0,w:crop.width,h:crop.height,annotation_id:row.box.id,source_image_id:row.photo.id,session_id:row.photo.sessionId||null,
      timestamp:row.photo.capturedAt||null,camera_azimuth:row.photo.viewpoint?.azimuth??null,camera_elevation:row.photo.viewpoint?.elevation??null,
      split_closed:row.split_closed,split_open:row.split_open};
  });
  Object.assign(document.guacabook,{crops:cropLinks,annotation_protocol:"guacabook-v1",review_policy:"per-region, source revision checked by server"});
  zip.file("annotations.json",JSON.stringify(document,null,2));
  zip.file("metadata.csv",csv(["id","width","height","file_name","identity","identities","timestamp","date","session_id","batch_id","quality","annotation_status","metadata_origin","original_file","sha256"],imageRows));
  zip.file("regions.csv",csv(["annotation_id","coco_annotation_id","image_id","identity","side","visibility","usability","occluded","review","reviewer_id","reviewed_at","review_revision","bbox","crop_file","exclusion_reasons"],regionRows));
  zip.file("crops.csv",csv(["crop_file","image_id","coco_image_id","annotation_id","coco_annotation_id","identity","side","source_file","original_file","source_bbox","width","height","sha256"],cropRows));
  zip.file("individuals.csv",csv(["id","name","species","speciesInfo","sex","birthYear"],data.birds.map(b=>({...b}))));
  zip.file("wildme/metadata.csv",csv(["theta","viewpoint","name","file_name","species","file_path","x","y","w","h","annotation_id","source_image_id","session_id","timestamp","camera_azimuth","camera_elevation","split_closed","split_open"],wildme));
  zip.file("wildme/prepare.py",PREPARE_MIEW);zip.file("README.txt",instructions);
  const counts=(key:"split_closed"|"split_open")=>Object.fromEntries(["train","valid","test","unsplit"].map(split=>[split,samples.filter(s=>s[key]===split).length]));
  const report={version:APP_VERSION,schema:3,images:data.photos.length,periocular_regions:regionRows.length,eligible_regions:samples.length,
    excluded_regions:regionRows.length-samples.length,split_closed:counts("split_closed"),split_open:counts("split_open"),
    notes:["Generic data includes drafts/unknowns; only reviewed eligible regions enter Wild Me CSV.","Empty or small partitions are not a validated evaluation benchmark.","Near-duplicates and identity reconciliation require human review."]};
  zip.file("report.json",JSON.stringify(report,null,2));
  return {zip,report};
}
