export type Bump = "patch" | "minor" | "major" | "prerelease" | "stable";
export function bumpVersion(version: string, kind: Bump): string {
  const match=/^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/.exec(version);
  if(!match)throw new Error("Unsupported version: " + version);
  let major=Number(match[1]),minor=Number(match[2]),patch=Number(match[3]);
  const beta=match[4]===undefined?null:Number(match[4]);
  if(kind==="stable")return `${major}.${minor}.${patch}`;
  if(kind==="prerelease" || (kind==="patch" && beta!==null))return `${major}.${minor}.${beta===null?patch+1:patch}-beta.${beta===null?1:beta+1}`;
  if(kind==="major"){major++;minor=0;patch=0;}
  else if(kind==="minor"){minor++;patch=0;}
  else patch++;
  return `${major}.${minor}.${patch}${beta===null?"":"-beta.1"}`;
}
export function bumpFromCommits(messages: string): "patch"|"minor"|"major" {
  if(/^\w+(?:\([^\n)]*\))?!:|^BREAKING CHANGE:/m.test(messages))return "major";
  if(/^feat(?:\([^\n)]*\))?:/m.test(messages))return "minor";
  return "patch";
}
