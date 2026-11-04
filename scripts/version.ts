import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { bumpFromCommits, bumpVersion, Bump } from "../lib/versioning";
async function main() {
const packageUrl=resolve("package.json"), lockUrl=resolve("package-lock.json");
const pkg=JSON.parse(await readFile(packageUrl,"utf8"));
const requested=process.argv[2];
let kind=requested as Bump;
if(requested==="auto") {
  const since=process.argv[3];
  if(!since || !/^[a-f0-9]{40}$/.test(since) || /^0+$/.test(since))throw new Error("A valid previous commit SHA is required");
  const before=JSON.parse(execFileSync("git",["show",`${since}:package.json`],{encoding:"utf8"}));
  if(before.version!==pkg.version){console.log("Version already changed in this delivery; no second increment.");process.exit(0);}
  const messages=execFileSync("git",["log","--format=%B",`${since}..HEAD`],{encoding:"utf8"});
  kind=bumpFromCommits(messages);
}
if(!["patch","minor","major","prerelease","stable"].includes(kind))throw new Error("Choose patch, minor, major, prerelease, stable or auto <previous-sha>");
const next=bumpVersion(pkg.version,kind), lock=JSON.parse(await readFile(lockUrl,"utf8"));
if(next===pkg.version){console.log("Version unchanged: "+next);process.exit(0);}
pkg.version=next;lock.version=next;lock.packages[""].version=next;
await writeFile(packageUrl,JSON.stringify(pkg,null,2)+"\n");
await writeFile(lockUrl,JSON.stringify(lock,null,2)+"\n");
console.log(`${next} (${kind})`);

}
void main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
