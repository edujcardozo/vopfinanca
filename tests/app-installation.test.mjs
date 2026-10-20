import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';

function embeddedImage(src){
  assert.match(src,/^data:image\/(png|svg\+xml);base64,/,'The installer must not need a separate authenticated image request.');
  return Buffer.from(src.slice(src.indexOf(',')+1),'base64');
}
test('installation icons are complete images in the delivered HTML and manifest, preserving the existing app identity',async()=>{
  const {document}=parseHTML(await readFile(new URL('../web/index.html',import.meta.url),'utf8'));
  const touch=[...document.querySelectorAll('link[rel=apple-touch-icon]')];assert.equal(touch.length,2);
  for(const link of touch){
    const size=Number(link.getAttribute('sizes').split('x')[0]),bytes=embeddedImage(link.getAttribute('href'));
    assert.deepEqual(bytes,await readFile(new URL(`../web/assets/vpo-dollar-${size}.png`,import.meta.url)));
    assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
  }
  assert.ok([...document.querySelectorAll('link[rel=icon]')].some(link=>link.getAttribute('href').startsWith('data:')));
  assert.equal(document.querySelector('link[rel=manifest]').getAttribute('crossorigin'),'use-credentials');
  const manifest=JSON.parse(await readFile(new URL('../web/manifest.webmanifest',import.meta.url),'utf8'));
  assert.equal(manifest.start_url,'./#plano');assert.equal(manifest.scope,'./');assert.equal(manifest.short_name,'VPO');
  for(const icon of manifest.icons){const size=Number(icon.sizes.split('x')[0]),bytes=embeddedImage(icon.src);assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);}
});
