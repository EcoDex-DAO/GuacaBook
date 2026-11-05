import {chromium,expect} from '@playwright/test';import assert from 'node:assert/strict';
import {A,rows,objects,setup,signIn} from './supabase-mock.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({locale:'fr-FR',viewport:{width:1366,height:768}}),png=await setup(page);
 const id='44444444-4444-4444-8444-444444444444',bird='bird',batch='batch';
 const frame=(id,category,side,bbox)=>({id,category,side,bbox,birdId:bird,...(category==='periocular_region'?{usability:'unknown',occluded:null}:{})});
 const photo={id,name:'face.png',width:400,height:300,birdId:bird,batchId:batch,capturedAt:'',sessionId:'',quality:'usable',bodyVisibility:'full',eyeVisible:'yes',eyeLayout:'both',viewpoint:{azimuth:0,elevation:0},completed:false,annotationVersion:1,doneSteps:[0,1,2,3],regionBySide:{left:'yes',right:'yes'},objectPath:`${A}/${id}`,mimeType:'image/png',boxes:[frame('body','macaw','unknown',[0,0,400,300]),frame('eye-left','eye','left',[80,50,20,20]),frame('eye-right','eye','right',[250,50,20,20]),frame('left','periocular_region','left',[60,30,60,60]),frame('right','periocular_region','right',[230,30,60,60])]};
 rows.set(A,{owner_id:A,revision:1,status:'submitted',updated_at:new Date().toISOString(),dataset:{profile:'Tester',consent:true,researchConsent:{version:'guacabook-research-v1',acceptedAt:new Date().toISOString()},birds:[{id:bird,name:'Kiwi',species:''}],photos:[photo],batchStages:{[batch]:4},annotationResume:{photoId:id,step:4}}});objects.set(photo.objectPath,Buffer.from(png,'base64'));
 await page.goto(process.env.TEST_BASE_URL||'http://localhost:3000');await signIn(page);
 await page.getByRole('button',{name:'Reprendre le travail enregistré',exact:true}).click();
 await expect(page.locator('.periocular-question')).toBeVisible();
 async function fits(){
  const size=await page.locator('.annotation-question-body').evaluate(el=>({scroll:el.scrollHeight,height:el.clientHeight,top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom}));
  assert.ok(size.scroll<=size.height+1,JSON.stringify(size));
  const buttons=page.locator('.periocular-visibility button,.periocular-question .region-choice-buttons button');await expect(buttons).toHaveCount(12);
  for(const button of await buttons.all()){
   const box=await button.boundingBox();assert.ok(box.y>=size.top-1&&box.y+box.height<=size.bottom+1,JSON.stringify({size,box}));
   await expect(button).toBeInViewport({ratio:1});
  }
  await expect(page.getByRole('button',{name:'Valider et continuer →',exact:true})).toBeInViewport({ratio:1});
  await expect(page.getByRole('button',{name:'Enregistrer et reprendre plus tard',exact:true})).toBeInViewport({ratio:1});
 }
 for(const viewport of [{width:1366,height:768},{width:1280,height:720},{width:1024,height:768}]){await page.setViewportSize(viewport);await fits();}
 await page.setViewportSize({width:1366,height:768});
 await page.getByRole('button',{name:/^Côté droit/}).click();await fits();
 await page.getByRole('group',{name:'Netteté de la région · 2',exact:true}).getByRole('button',{name:'Pixelisé',exact:true}).click();
 await expect.poll(()=>rows.get(A).dataset.photos[0].boxes.find(b=>b.id==='right')?.sharpness).toBe('pixelated');
 await page.getByRole('button',{name:/^Côté gauche/}).click();await fits();
 await expect(page.getByRole('group',{name:'Netteté de la région · 1',exact:true}).getByRole('button',{name:'Je ne sais pas',exact:true})).toHaveAttribute('aria-pressed','true');
 assert.equal(rows.get(A).dataset.photos[0].boxes.find(b=>b.id==='right').sharpness,'pixelated');
 await page.locator('.periocular-question').screenshot({path:'/tmp/guacabook-periocular-compact.png'});
 // A single-eye photo has the same complete set of controls without duplicate side navigation.
 const row=rows.get(A);row.dataset.photos[0].eyeLayout='left';row.dataset.photos[0].boxes=row.dataset.photos[0].boxes.filter(b=>b.side!=='right');row.revision++;
 await page.reload();await page.getByRole('button',{name:'Reprendre le travail enregistré',exact:true}).click();await fits();
 await expect(page.locator('.periocular-sides')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('PASS: all periocular choices and footer actions fit at 1366x768, 1280x720, 1024x768; left/right values remain independent; mobile has no horizontal overflow.');
}finally{await browser.close();}
