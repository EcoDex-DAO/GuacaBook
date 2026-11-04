import { Bird, Box, Dataset, Photo, stepValid } from "./dataset";
export type Review = { annotation_id: string; decision: "accepted" | "rejected"; reviewer_id?: string | null; reviewed_at?: string; dataset_revision?: number; source_sha256?: string };
export type Candidate = { photo: Photo; box: Box; bird: Bird; path: string; sha256: string; split_closed?: string; split_open?: string };
export function safeId(value: string) { return encodeURIComponent(value).replaceAll(".", "%2E"); }
export function regionReasons(data: Dataset, photo: Photo, box: Box, review?: Review): string[] {
  const reasons: string[] = [];
  if (!data.consent) reasons.push("consent_missing");
  if (!photo.completed || !stepValid(photo, 5)) reasons.push("workflow_incomplete");
  if (photo.quality !== "usable") reasons.push("photo_not_usable");
  if (box.category !== "periocular_region") reasons.push("not_periocular");
  if (!data.birds.some(b => b.id === box.birdId)) reasons.push("identity_missing");
  if (!["left", "right"].includes(box.side)) reasons.push("side_unknown");
  if (box.usability !== "usable") reasons.push("region_not_usable");
  if (box.occluded !== false) reasons.push("occlusion_or_unknown");
  if (!validBox(photo, box)) reasons.push("invalid_bbox");
  if (review?.decision !== "accepted") reasons.push(review?.decision === "rejected" ? "review_rejected" : "review_pending");
  return reasons;
}
export const reasonLabels: Record<string,string> = {
  consent_missing:"Autorisation de recherche manquante", workflow_incomplete:"Annotation à terminer",
  photo_not_usable:"Photo non exploitable", not_periocular:"Région périoculaire requise", identity_missing:"Animal non associé",
  side_unknown:"Côté anatomique inconnu", region_not_usable:"Netteté de la région à vérifier",
  occlusion_or_unknown:"Région masquée ou visibilité inconnue", invalid_bbox:"Cadre hors image ou invalide",
  source_changed_since_review:"Photo source modifiée depuis la revue",
  review_rejected:"Région rejetée par la revue", review_pending:"Revue scientifique en attente",
};
export function validBox(photo: Pick<Photo, "width" | "height">, box: Pick<Box, "bbox">) {
  const [x,y,w,h] = box.bbox;
  return [x,y,w,h].every(Number.isFinite) && x >= 0 && y >= 0 && w > 0 && h > 0 && x+w <= photo.width && y+h <= photo.height;
}
export function csv(columns: string[], rows: Record<string, unknown>[]) {
  const cell = (value: unknown) => {
    const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [columns.join(","), ...rows.map(row => columns.map(key => cell(row[key])).join(","))].join("\r\n") + "\r\n";
}
class Groups {
  parent: number[];
  constructor(n: number) { this.parent = Array.from({length:n},(_,i)=>i); }
  root(i: number): number { return this.parent[i] === i ? i : this.parent[i] = this.root(this.parent[i]); }
  join(a: number,b: number) { a=this.root(a); b=this.root(b); if(a!==b)this.parent[Math.max(a,b)] = Math.min(a,b); }
}
function allocations(n: number) {
  if(n < 3) return Array(n).fill("train") as string[];
  const test=Math.max(1,Math.floor(n*0.15)), valid=Math.max(1,Math.floor(n*0.15));
  return Array(n-test-valid).fill("train").concat(Array(valid).fill("valid"),Array(test).fill("test"));
}
// Samples from one original, duplicate original, session OR individual/day stay together.
export function assignSplits(input: Candidate[]): Candidate[] {
  const rows=input.map(row=>({...row,split_closed:"unsplit",split_open:"unsplit"}));
  const groups=new Groups(rows.length), seen=new Map<string,number>();
  rows.forEach((row,i)=>{
    const keys=[`photo:${row.photo.id}`,`hash:${row.sha256}`];
    if(row.photo.sessionId)keys.push(`session:${row.bird.id}:${row.photo.sessionId}`);
    if(row.photo.capturedAt)keys.push(`day:${row.bird.id}:${row.photo.capturedAt.slice(0,10)}`);
    keys.forEach(key=>{if(seen.has(key))groups.join(i,seen.get(key)!);else seen.set(key,i);});
  });
  const members=new Map<number,number[]>();
  rows.forEach((_,i)=>{const key=groups.root(i);members.set(key,[...(members.get(key)||[]),i]);});
  // Without a date or a session for every member, withhold the whole group.
  const usable=[...members].filter(([,indices])=>indices.every(i=>rows[i].photo.sessionId || rows[i].photo.capturedAt));
  const byIdentity=new Map<string,number[]>();
  usable.forEach(([key,indices])=>new Set(indices.map(i=>rows[i].bird.id)).forEach(id=>byIdentity.set(id,[...(byIdentity.get(id)||[]),key])));
  const order=(key:number)=>members.get(key)!.map(i=>rows[i].photo.capturedAt || `~${rows[i].photo.sessionId}`).sort()[0];
  const assigned=new Map<number,string>(), priority:Record<string,number>={test:0,valid:1,train:2};
  for(const keys of byIdentity.values()) {
    keys.sort((a,b)=>order(a).localeCompare(order(b)) || members.get(a)!.map(i=>rows[i].photo.id).sort()[0].localeCompare(members.get(b)!.map(i=>rows[i].photo.id).sort()[0]));
    const splits=allocations(keys.length);
    keys.forEach((key,i)=>{if(!assigned.has(key)||priority[splits[i]]>priority[assigned.get(key)!])assigned.set(key,splits[i]);});
  }
  usable.forEach(([key,indices])=>indices.forEach(i=>rows[i].split_closed=assigned.get(key)!));
  // Open-set protocol: disjoint identity groups, including co-occurring identities.
  const identities=[...byIdentity.keys()].sort(), identityIndex=new Map(identities.map((id,i)=>[id,i]));
  const identityGroups=new Groups(identities.length);
  usable.forEach(([,indices])=>{const ids=[...new Set(indices.map(i=>rows[i].bird.id))];ids.slice(1).forEach(id=>identityGroups.join(identityIndex.get(ids[0])!,identityIndex.get(id)!));});
  const roots=[...new Set(identities.map((_,i)=>identityGroups.root(i)))].sort((a,b)=>identities[a].localeCompare(identities[b]));
  const open=allocations(roots.length);
  rows.forEach(row=>{const i=identityIndex.get(row.bird.id);if(row.split_closed!=="unsplit"&&i!==undefined)row.split_open=open[roots.indexOf(identityGroups.root(i))];});
  return rows;
}
