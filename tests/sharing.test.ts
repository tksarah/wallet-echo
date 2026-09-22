import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shareText,publicSiteUrl,xShareUrl} from '../src/lib/sharing';
import examples from '../src/lib/examples.json';
import {translate} from '../src/lib/translations';
import '../src/lib/translation-details';

test('English sharing and activity translations preserve values without new generation',()=>{
  const name='積み重ねる者 — RPG HEROのEcho';
  const text=shareText(name,'rpg-hero','','en');
  assert.match(text,/Steady builder — RPG HERO Echo/);
  assert.ok(text.endsWith(''));
  assert.doesNotMatch(text,/[ぁ-んァ-ン一-龯]/);
  assert.equal(new URL(xShareUrl(text)).searchParams.get('text'),text);
  for(const example of examples){
    for(const text of [example.name,example.summary,example.pose,example.motif,example.temperamentLabel,...example.evidence]){
      assert.equal(translate(text,'ja'),text);
      assert.doesNotMatch(translate(text,'en'),/[ぁ-んァ-ン一-龯]/);
    }
  }
  const evidence='取得範囲内の確定済みの活動は181件、成功した操作は179件です。';
  assert.match(translate(evidence,'en'),/181 confirmed activities and 179 successful operations/);
  assert.match(translate('このウォレットの3回分の生成枠を使い切りました。上限のリセットは管理者にお問い合わせください。','en'),/all 3 generation attempts/);
});

test('no deployment URL is embedded by default',()=>{
  const configured=process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  try{assert.equal(publicSiteUrl(),'');}
  finally{
    if(configured===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL=configured;
  }
});

test('sharing includes only public display fields and the configured root URL',()=>{
  const text=shareText('星のEcho','rpg-hero','https://example.com/result/private?address=secret#job');
  assert.match(text,/星のEcho/);assert.match(text,/RPG HERO/);assert.match(text,/#WalletEcho #Astar/);
  assert.ok(text.endsWith('https://example.com/'));assert.doesNotMatch(text,/private|secret|address|job/);
  const intent=new URL(xShareUrl(text));assert.equal(intent.searchParams.get('text'),text);
  assert.equal(intent.pathname,'/intent/tweet');
  assert.doesNotMatch(shareText('Echo','collectible',''),/https?:/);
  for(const url of ['javascript:alert(1)','not a url','https://user:pass@example.com'])assert.equal(publicSiteUrl(url),'');
});

test('five published examples omit identifiers and internal judgment fields',()=>{
  assert.equal(new Set(examples.map(e=>e.style)).size,5);
  for(const e of examples){assert.ok(e.name&&e.evidence.length&&e.image&&e.thumbnail);}
  assert.doesNotMatch(JSON.stringify(examples),/0x[0-9a-f]{40}|imagePrompt|probabilities|confidence|requestKey|fetchedAt/);
});
