import {test} from "node:test";
import assert from "node:assert/strict";
import {bumpFromCommits,bumpVersion} from "../lib/versioning";
test("semantic versions distinguish fixes, features, breaking changes and validated milestones",()=>{
  assert.equal(bumpVersion("1.0.0","patch"),"1.0.1");
  assert.equal(bumpVersion("1.0.0","minor"),"1.1.0");
  assert.equal(bumpVersion("1.2.3","major"),"2.0.0");
  assert.equal(bumpVersion("1.0.0-beta.1","patch"),"1.0.0-beta.2");
  assert.equal(bumpVersion("1.0.0-beta.2","stable"),"1.0.0");
  assert.equal(bumpVersion("1.0.0","prerelease"),"1.0.1-beta.1");
  assert.equal(bumpVersion("1.0.0-beta.1","minor"),"1.1.0-beta.1");
  assert.equal(bumpFromCommits("fix: a correction"),"patch");
  assert.equal(bumpFromCommits("feat(dataset): add fields"),"minor");
  assert.equal(bumpFromCommits("feat(schema)!: incompatible format"),"major");
  assert.equal(bumpFromCommits("fix: something\n\nBREAKING CHANGE: old API removed"),"major");
  assert.throws(()=>bumpVersion("nonsense","minor"));
});
