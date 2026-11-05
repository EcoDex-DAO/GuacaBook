import {chromium,expect} from "@playwright/test";
import assert from "node:assert/strict";
import {A,rows,setup,signIn,faults} from "./supabase-mock.mjs";
const browser=await chromium.launch({executablePath:"/usr/bin/chromium",args:["--no-sandbox","--enable-unsafe-swiftshader"]});
try {
 const page=await browser.newPage({locale:"fr-FR",viewport:{width:1440,height:1100},hasTouch:true});
 const png=await setup(page);
 await page.goto(process.env.TEST_BASE_URL||"http://localhost:3000");await signIn(page);
 await page.getByLabel("Nom ou pseudonyme",{exact:true}).fill("Tester");
 await page.getByRole("button",{name:"Entrer dans GuacaBook →",exact:true}).click();
 await page.getByLabel("Nom (facultatif)",{exact:true}).fill("Kiwi");
 await page.getByRole("button",{name:"Créer un ara",exact:true}).click();
 await page.getByLabel("Photos du lot").setInputFiles([1,2,3].map(i=>({name:`photo-${i}.png`,mimeType:"image/png",buffer:Buffer.from(png,"base64")})));
 const select=page.getByLabel("Choisir une photo du lot");
 await expect(select.locator("option")).toHaveCount(3);
 const ids=await select.locator("option").evaluateAll(options=>options.map(o=>o.value));
 const rail=await page.locator(".batch-photo-selector").boundingBox();
 const image=await page.locator(".imagepanel").boundingBox();
 const questions=await page.locator(".question").boundingBox();
 assert.ok(rail.x+rail.width<=image.x && image.x+image.width<=questions.x);
 assert.equal(await page.locator(".imagepanel .batch-photo-selector").count(),0);
 const button=name=>page.getByRole("button",{name,exact:true});
 await page.setViewportSize({width:1366,height:768});
 async function workspaceFits(){
   const dimensions=await page.evaluate(()=>({height:innerHeight,scroll:document.documentElement.scrollHeight,
     body:document.querySelector(".annotation-question-body").getBoundingClientRect().bottom,
     footer:document.querySelector(".annotation-question-footer").getBoundingClientRect().bottom}));
   assert.ok(dimensions.scroll<=dimensions.height+1,JSON.stringify(dimensions));
   assert.ok(dimensions.footer<=dimensions.height,JSON.stringify(dimensions));
   await expect(button("Enregistrer et reprendre plus tard")).toBeInViewport({ratio:1});
   await expect(page.locator(".annotation-workspace > .savestatus")).toBeInViewport({ratio:1});
   await expect(page.locator(".accountbar")).toBeHidden();
 }
 await workspaceFits();
 await page.screenshot({path:"/tmp/guacabook-workspace-quality.png"});

 async function saved(){await page.getByRole("status").filter({hasText:"Toutes les modifications sont enregistrées en ligne."}).first().waitFor();}
 await button("Photo suivante").click();assert.equal(await select.inputValue(),ids[1]);
 assert.equal(await page.locator(".steps button").nth(0).getAttribute("aria-current"),"step");
 await button("Photo précédente").click();assert.equal(await select.inputValue(),ids[0]);
 await button("Étape suivante").click();assert.equal(await select.inputValue(),ids[0]);
 await workspaceFits();
 await page.screenshot({path:"/tmp/guacabook-workspace-viewpoint.png"});
 assert.equal(await page.locator(".steps button").nth(1).getAttribute("aria-current"),"step");
 await button("Étape précédente").click();assert.equal(await button("Valider et continuer →").isDisabled(),true);
 await button("Nette / exploitable").click();await button("Valider et continuer →").click();
 assert.equal(await select.inputValue(),ids[1]);
 assert.equal(await page.locator(".steps button").nth(0).getAttribute("aria-current"),"step");
 assert.equal(await button("Nette / exploitable").getAttribute("aria-pressed"),"false");
 await button("Étape suivante").click();await button("Étape suivante").click();
 async function point(x,y){return page.locator("svg.zoom-canvas").evaluate((svg,p)=>{const m=svg.getScreenCTM(),v=new DOMPoint(p.x,p.y).matrixTransform(m);return {x:v.x,y:v.y};},{x,y});}
 await page.locator("svg.zoom-canvas").scrollIntoViewIfNeeded();
 let first=await point(150,110),last=await point(220,175);
 await page.mouse.move(first.x,first.y);await page.mouse.down();await page.mouse.move(last.x,last.y,{steps:6});await page.mouse.up();
 await expect(button("Oui, l’ara est entier")).toHaveAttribute("aria-pressed","true");
 await button("Réinitialiser les cadres de l’étape").click();
 for(const label of ["Oui, l’ara est entier","Non, une partie est hors cadre","Le corps n’est pas visible","Je ne sais pas"])
   await expect(button(label)).toHaveAttribute("aria-pressed","false");
 await button("Non, une partie est hors cadre").click();
 const a=await point(140,110),b=await point(240,190);
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();await saved();
 const id=rows.get(A).dataset.photos[1].boxes[0].id;
 const handle=corner=>page.locator(`[data-resize-box="${id}"][data-corner="${corner}"]`);
 assert.equal(await page.locator(`[data-resize-box="${id}"]`).count(),4);
 const pivot=await point(180,140);await page.mouse.move(pivot.x,pivot.y);
 const oldView=await page.locator("svg.zoom-canvas").getAttribute("viewBox");
 await page.mouse.wheel(0,-100);
 await page.waitForFunction(previous=>document.querySelector("svg.zoom-canvas").getAttribute("viewBox")!==previous,oldView);
 const projected=await point(180,140);assert.ok(Math.abs(projected.x-pivot.x)<1&&Math.abs(projected.y-pivot.y)<1);
 const enlarged=await page.locator("svg.zoom-canvas").getAttribute("viewBox");
 await page.mouse.wheel(0,100);
 await page.waitForFunction(previous=>document.querySelector("svg.zoom-canvas").getAttribute("viewBox")!==previous,enlarged);
 const reduced=await point(180,140);assert.ok(Math.abs(reduced.x-pivot.x)<1&&Math.abs(reduced.y-pivot.y)<1);
 assert.equal(await button("Déplacer l’image").count(),1);
 await button("Zoomer").click();
 async function center(corner){return handle(corner).locator("circle").last().evaluate(circle=>{const p=new DOMPoint(circle.cx.baseVal.value,circle.cy.baseVal.value).matrixTransform(circle.getScreenCTM());return {x:p.x,y:p.y};});}
 await handle(0).scrollIntoViewIfNeeded();
 let start=await center(0),end=await point(120,90);
 assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.closest("[data-resize-box]")?.getAttribute("data-resize-box"),start),id);
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();await saved();
 let box=rows.get(A).dataset.photos[1].boxes[0];
 assert.equal(box.id,id);assert.equal(rows.get(A).dataset.photos[1].boxes.length,1);
 await expect.poll(()=>rows.get(A).dataset.photos[1].boxes[0].bbox.map(Math.round)).toEqual([120,90,120,100]);
 box=rows.get(A).dataset.photos[1].boxes[0];
 assert.deepEqual(box.bbox.map(Math.round),[120,90,120,100]);
 // Keyboard resizing changes the selected corner in original image coordinates.
 await handle(0).focus();await handle(0).press("Shift+ArrowDown");await saved();
 assert.deepEqual(rows.get(A).dataset.photos[1].boxes[0].bbox.map(Math.round),[120,100,120,90]);
 // Real touch pointer events resize the opposite corner, not a new rectangle.
 const cdp=await page.context().newCDPSession(page);start=await center(3);end=await point(250,200);
 await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:start.x,y:start.y,id:1}]});
 await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:end.x,y:end.y,id:1}]});
 await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await saved();
 assert.deepEqual(rows.get(A).dataset.photos[1].boxes[0].bbox.map(Math.round),[120,100,130,100]);
 assert.equal(rows.get(A).dataset.photos[1].boxes.length,1);
 // A cancelled drag must restore the prior box without saving it.
 start=await center(0);end=await point(130,110);
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:5});
 await page.locator("svg.zoom-canvas").dispatchEvent("pointercancel",{pointerId:1});await page.mouse.up();
 assert.deepEqual(rows.get(A).dataset.photos[1].boxes[0].bbox.map(Math.round),[120,100,130,100]);
 // Save failure keeps the editor open; successful retry persists the exact cursor.
 faults.writes=1;await button("Enregistrer et reprendre plus tard").click();
 await page.getByRole("alert").filter({hasText:"La sauvegarde a échoué"}).waitFor();
 assert.equal(await page.locator(".annotationgrid").count(),1);
 await button("Enregistrer et reprendre plus tard").click();await button("Reprendre le travail enregistré").waitFor();
 assert.deepEqual(rows.get(A).dataset.annotationResume,{photoId:ids[1],step:2});
 await page.reload();await button("Reprendre le travail enregistré").click();
 assert.equal(await select.inputValue(),ids[1]);
 assert.equal(await page.locator(".steps button").nth(2).getAttribute("aria-current"),"step");
 assert.equal(rows.get(A).dataset.photos[1].doneSteps.includes(2),false);
 await button("Étape suivante").click();
 assert.equal(await page.locator(".eye-layout-options button").count(),5);
 assert.equal(await button("Oui, au moins un œil visible").count(),0);
 await page.locator("svg.zoom-canvas").scrollIntoViewIfNeeded();
 first=await point(150,110);last=await point(200,150);
 await page.mouse.move(first.x,first.y);await page.mouse.down();await page.mouse.move(last.x,last.y,{steps:6});await page.mouse.up();await saved();
 let eye=rows.get(A).dataset.photos[1].boxes.find(b=>b.category==="eye");
 assert.ok(eye);assert.equal(eye.side,"unknown");
 assert.equal(rows.get(A).dataset.photos[1].eyeVisible,"yes");
 await button("Œil droit").click();await saved();
 assert.equal(rows.get(A).dataset.photos[1].boxes.find(b=>b.id===eye.id).side,"right");
 await expect(button("Œil droit")).toHaveAttribute("aria-pressed","true");
 await button("Réinitialiser les cadres de l’étape").click();
 for(const choice of await page.locator(".eye-layout-options button").all())await expect(choice).toHaveAttribute("aria-pressed","false");
 await saved();assert.equal(rows.get(A).dataset.photos[1].boxes.some(b=>b.category==="eye"),false);
 await button("Œil gauche").click();
 assert.equal(await page.locator(".target-sides").count(),0);
 assert.equal(await button("Réinitialiser ce côté uniquement").count(),0);
 await button("Œil droit").click();assert.equal(rows.get(A).dataset.photos[1].boxes.length,1);
 await button("Face · deux yeux").click();
 assert.equal(await page.locator(".target-sides button").count(),2);
 await button("Je ne sais pas").click();assert.equal(await page.locator(".target-sides").count(),0);
 await button("Non, aucun œil visible").click();await saved();
 assert.equal(rows.get(A).dataset.photos[1].eyeVisible,"no");
 assert.equal(rows.get(A).dataset.photos[1].boxes[0].id,id);
 await button("Œil gauche").click();
 await button("Étape suivante").click();
 const visibleButton=button("La région de ce côté est visible");
 const partialButton=button("La région de ce côté est masquée / coupée");
 async function drawRegion(){
   await page.locator("svg.zoom-canvas").scrollIntoViewIfNeeded();
   const start=await point(150,110),end=await point(220,175);
   await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:6});await page.mouse.up();
 }
 assert.equal(await visibleButton.getAttribute("aria-pressed"),"false");
 await drawRegion();
 assert.equal(await visibleButton.getAttribute("aria-pressed"),"true");
 await button("Réinitialiser les cadres de l’étape").click();
 for(const label of ["La région de ce côté est visible","La région de ce côté est masquée / coupée","La région de ce côté n’est pas visible","Je ne sais pas pour ce côté"])
   assert.equal(await button(label).getAttribute("aria-pressed"),"false");
 await partialButton.click();await drawRegion();await saved();
 assert.equal(await partialButton.getAttribute("aria-pressed"),"true");
 assert.equal(await visibleButton.getAttribute("aria-pressed"),"false");
 assert.equal(rows.get(A).dataset.photos[1].regionBySide.left,"partial");
 assert.equal(rows.get(A).dataset.photos[1].boxes.filter(b=>b.category==="periocular_region").length,1);
 await workspaceFits();
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:"/tmp/guacabook-rail-mobile.png",fullPage:true});
 await page.setViewportSize({width:1440,height:1100});
 await page.locator(".annotationgrid").screenshot({path:"/tmp/guacabook-rail-desktop.png"});
 console.log("PASS: distinct photo/step navigation, explicit validation, zoomed mouse/keyboard/touch resize, cancel, save failure/retry and exact cloud resume (simulated API).");
} finally {await browser.close();}
