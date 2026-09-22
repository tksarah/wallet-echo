import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ProgressView} from '../src/app/components/progress';
test('progress exposes real stage, elapsed time and connection loss without fabricated percentages',()=>{
  for(const [status,label]of [['analyzing','履歴取得'],['judging','個性の判定'],['generating','画像生成']]){
    const html=renderToStaticMarkup(React.createElement(ProgressView,{status,elapsed:75,disconnected:false,onReconnect:()=>{}}));
    assert.ok(html.includes(label+'を進めています'));assert.ok(html.includes('1分15秒'));assert.ok(html.includes('aria-current="step"'));assert.ok(html.includes('spinner-ring'));assert.ok(!html.includes('%'));
  }
  const html=renderToStaticMarkup(React.createElement(ProgressView,{status:'generating',elapsed:90,disconnected:true,onReconnect:()=>{}}));
  assert.ok(html.includes('状況を確認できません'));assert.ok(html.includes('状況の確認を再開'));assert.ok(html.includes('is-disconnected'));assert.ok(!html.includes('progress-light'));
});
