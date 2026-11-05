import {chromium} from "@playwright/test";
import assert from "node:assert/strict";
import {A,rows,objects,setup,signIn} from "./supabase-mock.mjs";
const browser=await chromium.launch({executablePath:"/usr/bin/chromium",args:["--no-sandbox","--enable-unsafe-swiftshader"]});
try {
  const page=await browser.newPage({locale:"fr-FR"});
  const png=await setup(page);
  const ids=Array.from({length:5},(_,i)=>`${i+3}${"3".repeat(7)}-3333-4333-8333-333333333333`);
  const photos=ids.map((id,i)=>({id,name:`photo-${i+1}.png`,objectPath:`${A}/${id}`,mimeType:"image/png",width:400,height:300,birdId:"bird",batchId:i===4?"other":"batch",quality:"unreviewed",capturedAt:i===2?"2020-01-02T09:10:11":"",sessionId:i===2?"Existing session":"",metadataOrigin:i===2?{capturedAt:"exif",sessionId:"manual"}:{},boxes:[]}));
  rows.set(A,{owner_id:A,revision:1,status:"draft",consented_at:null,dataset:{profile:"Tester",consent:true,researchConsent:{version:"guacabook-research-v1",acceptedAt:new Date().toISOString()},birds:[{id:"bird",name:"Kiwi",species:""}],photos}});
  photos.forEach(p=>objects.set(p.objectPath,Buffer.from(png,"base64")));
  await page.goto(process.env.TEST_BASE_URL||"http://localhost:3000");await signIn(page);
  async function choose(name) {
    await page.locator(".photolist li").filter({has:page.getByText(name,{exact:true})}).getByRole("button",{name:"Reprendre →",exact:true}).click();
  }
  async function saved() {await page.getByRole("status").filter({hasText:"Toutes les modifications sont enregistrées en ligne."}).first().waitFor();}
  await page.getByRole("button",{name:"Choisir cet animal →",exact:true}).click();
  await choose("photo-1.png");
  await page.getByLabel("Date et heure (sans fuseau)").fill("2026-11-05T12:40:45");
  await page.getByLabel("Séance",{exact:true}).fill("Matin");
  await page.getByRole("button",{name:"Nette / exploitable",exact:true}).click();
  await page.getByRole("button",{name:"Enregistrer et continuer →",exact:true}).click();
  assert.equal(await page.getByLabel("Date et heure (sans fuseau)").inputValue(),"2026-11-05T12:40:45");
  assert.equal(await page.getByLabel("Séance",{exact:true}).inputValue(),"Matin");
  assert.equal(await page.getByRole("button",{name:"Nette / exploitable",exact:true}).getAttribute("aria-pressed"),"false");
  assert.equal(await page.getByRole("button",{name:"Enregistrer et continuer →",exact:true}).isDisabled(),true);
  await saved();await page.reload();
  await page.getByRole("button",{name:"Choisir cet animal →",exact:true}).click();await choose("photo-2.png");
  assert.equal(await page.getByLabel("Séance",{exact:true}).inputValue(),"Matin");
  assert.equal(rows.get(A).dataset.photos[1].metadataOrigin.capturedAt,"batch");
  await page.getByLabel("Date et heure (sans fuseau)").fill("");await page.getByLabel("Séance",{exact:true}).fill("");
  await page.getByRole("button",{name:"Floue / à refaire",exact:true}).click();
  await page.getByRole("button",{name:"Enregistrer et continuer →",exact:true}).click();
  assert.equal(await page.getByLabel("Date et heure (sans fuseau)").inputValue(),"2020-01-02T09:10:11");
  assert.equal(await page.getByLabel("Séance",{exact:true}).inputValue(),"Existing session");
  // Direct photo selection also reuses values, without changing sharpness.
  await page.getByLabel("Choisir une photo du lot").selectOption(ids[3]);
  assert.equal(await page.getByLabel("Séance",{exact:true}).inputValue(),"Existing session");
  assert.equal(await page.getByRole("button",{name:"Nette / exploitable",exact:true}).getAttribute("aria-pressed"),"false");
  await page.getByLabel("Choisir une photo du lot").selectOption(ids[1]);
  assert.equal(await page.getByLabel("Date et heure (sans fuseau)").inputValue(),"");
  assert.equal(await page.getByLabel("Séance",{exact:true}).inputValue(),"");
  await page.getByRole("button",{name:"← Retour au lot",exact:true}).click();await choose("photo-5.png");
  assert.equal(await page.getByLabel("Date et heure (sans fuseau)").inputValue(),"");
  assert.equal(await page.getByLabel("Séance",{exact:true}).inputValue(),"");
  await page.getByRole("button",{name:"Nette / exploitable",exact:true}).click();
  await page.getByRole("button",{name:"Enregistrer et continuer →",exact:true}).click();
  // Visual height controls keep the chosen anatomical direction and save elevation.
  await page.getByRole("button",{name:"Profil droit",exact:true}).click();
  await page.getByRole("button",{name:"Au-dessus de l’ara",exact:true}).click();
  assert.equal(await page.getByRole("button",{name:"Au-dessus de l’ara",exact:true}).getAttribute("aria-pressed"),"true");
  await saved();assert.deepEqual(rows.get(A).dataset.photos[4].viewpoint,{azimuth:90,elevation:30});
  await page.getByRole("button",{name:"En dessous de l’ara",exact:true}).click();
  await saved();assert.deepEqual(rows.get(A).dataset.photos[4].viewpoint,{azimuth:90,elevation:-30});
  await page.getByRole("button",{name:"À hauteur de l’ara",exact:true}).click();
  await saved();assert.deepEqual(rows.get(A).dataset.photos[4].viewpoint,{azimuth:90,elevation:0});
  await page.getByRole("button",{name:"Point de vue inconnu",exact:true}).click();
  await saved();assert.equal(rows.get(A).dataset.photos[4].viewpoint,null);
  assert.equal(await page.getByRole("button",{name:"Au-dessus de l’ara",exact:true}).isDisabled(),true);
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:"/tmp/guacabook-height-buttons.png",fullPage:true});
  console.log("PASS: batch date/session reuse, cloud reload, independent photo quality, EXIF preservation, explicit clearing, dropdown navigation and batch isolation (simulated API).");
} finally {await browser.close();}
