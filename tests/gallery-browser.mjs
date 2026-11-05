import {chromium,expect} from '@playwright/test';import assert from 'node:assert/strict';import JSZip from 'jszip';import {readFile} from 'node:fs/promises';
import {A,B,rows,objects,setup,signIn,photoReviews} from './supabase-mock.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({locale:'fr-FR',viewport:{width:1440,height:1000}}),page=await context.newPage();const png=await setup(page);
 function seed(owner,id,name){
  const photo={id,name,width:400,height:300,birdId:`bird-${owner}`,capturedAt:'',sessionId:'',quality:'usable',bodyVisibility:'not_visible',eyeVisible:'no',viewpoint:null,completed:true,annotationVersion:1,boxes:[],objectPath:`${owner}/${id}`,mimeType:'image/png'};
  rows.set(owner,{owner_id:owner,revision:1,status:'submitted',updated_at:new Date().toISOString(),dataset:{profile:owner===A?'Admin':'Ben',consent:true,researchConsent:{version:'guacabook-research-v1',acceptedAt:new Date().toISOString()},birds:[{id:photo.birdId,name:'Kiwi',species:''}],photos:[photo]}});objects.set(photo.objectPath,Buffer.from(png,'base64'));
 }
 seed(A,'55555555-5555-4555-8555-555555555555','own.png');seed(B,'44444444-4444-4444-8444-444444444444','contribution.png');
 await page.goto(process.env.TEST_BASE_URL||'http://localhost:3000');await signIn(page);
 await page.getByRole('button',{name:'Photos et validation',exact:true}).click();await expect(page.locator('.gallery-card')).toHaveCount(2);
 await page.locator('.gallery-card').filter({hasText:'own.png'}).click();await page.getByText('Vos propres photos doivent être validées par un autre vérificateur.',{exact:true}).waitFor();
 await expect(page.getByRole('button',{name:'Valider cette photo pour le dataset',exact:true})).toHaveCount(0);
 await page.locator('.gallery-card').filter({hasText:'contribution.png'}).click();await page.getByRole('button',{name:'Valider cette photo pour le dataset',exact:true}).click();
 await expect.poll(()=>photoReviews.get(`${B}:44444444-4444-4444-8444-444444444444`)?.decision).toBe('accepted');
 await page.locator('.photo-detail').getByText('Validée par un vérificateur',{exact:true}).waitFor();
 await page.screenshot({path:'/tmp/guacabook-gallery.png',fullPage:true});
 await page.getByRole('button',{name:'Dataset',exact:true}).click();
 await page.getByText('Administration des contributions',{exact:true}).click();
 let globalDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Exporter V1 (COCO + Wild Me)',exact:true}).click();
 const globalZip=await JSZip.loadAsync(await readFile(await (await globalDownload).path()));
 const globalData=JSON.parse(await globalZip.file('annotations.json').async('string'));
 assert.equal(globalData.images.length,1);assert.ok(globalData.images[0].file_name.includes(B));
 const contributorContext=await browser.newContext({locale:'fr-FR',viewport:{width:1440,height:1000}}),contributor=await contributorContext.newPage();await setup(contributor);
 await contributor.goto(process.env.TEST_BASE_URL||'http://localhost:3000');await signIn(contributor,'b@example.com');
 await contributor.getByRole('button',{name:'Photos et validation',exact:true}).click();await expect(contributor.locator('.gallery-card')).toHaveCount(1);
 await contributor.locator('.gallery-card').click();await contributor.getByRole('button',{name:'Revérifier mes annotations',exact:true}).waitFor();
 await expect(contributor.getByRole('button',{name:'Valider cette photo pour le dataset',exact:true})).toHaveCount(0);
 await contributor.getByRole('button',{name:'Dataset',exact:true}).click();await contributor.getByText('Exporter mes données',{exact:true}).click();
 let download=contributor.waitForEvent('download');await contributor.getByRole('button',{name:'Exporter le dataset ↗',exact:true}).click();let zip=await JSZip.loadAsync(await readFile(await (await download).path()));assert.equal(JSON.parse(await zip.file('annotations.json').async('string')).images.length,1);
 // An edit to the annotated photo invalidates its approval, even if the completed flag stays true.
 const row=rows.get(B);row.dataset.photos[0].bodyVisibility='unknown';row.revision++;
 await contributor.getByRole('button',{name:'Exporter le dataset ↗',exact:true}).click();
 await contributor.getByRole('alert').filter({hasText:'Aucune photo validée par un vérificateur à exporter.'}).waitFor();
 console.log('PASS: reviewer sees all photos, cannot self-approve; contributor sees own photos only; approved-only exports invalidate after edits.');
}finally{await browser.close();}
