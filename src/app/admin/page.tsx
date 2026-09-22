'use client';
import {Localized,LanguageToggle,useLanguage} from '../components/language';
import {translate} from '@/lib/translations';
import {useEffect,useRef,useState} from 'react';
import type {adminData} from '@/lib/jobs';
import {listNames,type AdminQueries,type ListName} from '@/lib/admin-lists';
import {styleName} from '@/lib/styles';
import Pagination from '../components/pagination';
import {NotificationBar,useNotifications} from '../components/notifications';
import {NativeSelect,NativeSelectOption} from '@/components/ui/native-select';
import {rejectionLabels} from '@/lib/rejection-labels';
type Data=Awaited<ReturnType<typeof adminData>>;
const tabs=[['overview','概要・受付'],['wallet','ウォレット'],['history','実行履歴'],['log','運用ログ']] as const;
type Tab=typeof tabs[number][0];
const initialQueries:AdminQueries={wallet:{search:'',page:1},history:{search:'',page:1},log:{search:'',page:1}};
const money=(v:number)=>`$${v.toFixed(4)} / 約${(v*150).toFixed(2)}円`;
const states:Record<string,string>={analyzing:'履歴取得中',judging:'判定中',generating:'画像生成中',complete:'完了',failed:'失敗'};
async function api<T>(url:string,init?:RequestInit):Promise<T>{const r=await fetch(url,{...init,cache:'no-store'});const d=await r.json() as T & {error?:{message?:string}};if(!r.ok)throw Object.assign(new Error(d.error?.message||'通信できませんでした。'),{status:r.status});return d;}
export default function Admin(){
  const {language}=useLanguage();
  const time=(v:string)=>new Date(v).toLocaleString(language==='en'?'en-US':'ja-JP');
  const {notify,clear}=useNotifications();
  const [data,setData]=useState<Data|null>(null),[authenticated,setAuthenticated]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[tab,setTab]=useState<Tab>('overview');
  const [password,setPassword]=useState(''),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[updatedAt,setUpdatedAt]=useState('');
  const [drafts,setDrafts]=useState({wallet:'',history:'',log:''});
  const [draftLimit,setDraftLimit]=useState(3);
  useEffect(()=>{if(data)setDraftLimit(data.concurrentLimit);},[data?.concurrentLimit]);
  const queries=useRef(initialQueries),sequence=useRef(0),controller=useRef<AbortController|null>(null),acting=useRef(false),panel=useRef<HTMLElement>(null),toolbar=useRef<HTMLDivElement>(null);
  const disabled=busy||loading;
  useEffect(()=>{const element=toolbar.current;if(!element)return;const observer=new ResizeObserver(()=>{element.closest('main')?.style.setProperty('--admin-toolbar-height',element.getBoundingClientRect().height+'px');});observer.observe(element);return()=>observer.disconnect();},[]);
  function report(error:unknown,id='admin-action'){
    const e=error as {status?:number;message?:string};
    const message=e.status===401&&authenticated?'ログインの有効期限が切れました。もう一度ログインしてください。':e.message||'通信できませんでした。';
    if(e.status===401){setAuthenticated(false);setData(null);setPassword('');}
    setError(message);notify(id,'error',message);return message;
  }
  async function load(next=queries.current,scroll=false){
    const request=++sequence.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;
    setLoading(true);setLoadError('');clear('admin-load');
    const params=new URLSearchParams();for(const name of listNames){params.set(name+'Search',next[name].search);params.set(name+'Page',String(next[name].page));}
    try{
      const d=await api<Data>('/api/admin/data?'+params,{signal:abort.signal});if(request!==sequence.current)return false;
      queries.current=Object.fromEntries(listNames.map(name=>[name,{search:d.pagination[name].search,page:d.pagination[name].page}])) as AdminQueries;
      setData(d);setAuthenticated(true);setError('');setUpdatedAt(new Date().toISOString());
      if(scroll)requestAnimationFrame(()=>panel.current?.scrollIntoView({behavior:'instant',block:'start'}));return true;
    }catch(e){if(request!==sequence.current||(e as Error).name==='AbortError')return false;
      if((e as {status?:number}).status===401){setAuthenticated(false);setData(null);if(data)report(e,'admin-load');}
      else {const message=report(e,'admin-load');setLoadError(message);}return false;
    }finally{if(request===sequence.current)setLoading(false);}
  }
  useEffect(()=>{void load();return()=>{sequence.current++;controller.current?.abort();clear('admin-load');clear('admin-action');};},[]);
  async function action(work:()=>Promise<void>){if(acting.current||loading)return;acting.current=true;setBusy(true);setError('');clear('admin-action');try{await work();}catch(e){report(e);}finally{acting.current=false;setBusy(false);}}
  async function login(e:React.FormEvent){e.preventDefault();clear('admin-load');setLoadError('');await action(async()=>{await api('/api/admin/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});setPassword('');await load();});}
  async function reset(addressType:string,address:string){if(disabled||!confirm(translate(`${address}\nの生成枠を3回に戻します。累計回数と費用は保持します。`,language)))return;await action(async()=>{await api('/api/admin/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:`${addressType}:${address}`})});notify('admin-action','success','生成枠を3回にリセットしました。');await load();});}
  async function toggleReception(){if(!data)return;await action(async()=>{const result=await api<{receptionPaused:boolean}>('/api/admin/reception',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paused:!data.receptionPaused})});setData(old=>old?{...old,...result}:old);notify('admin-action','success',result.receptionPaused?'新規生成と再試行の受付を停止しました。':'生成の受付を再開しました。');await load();});}
  function selectTab(next:Tab){setTab(next);requestAnimationFrame(()=>panel.current?.scrollIntoView({behavior:'instant',block:'start'}));}
  async function saveConcurrency(){await action(async()=>{const result=await api<{concurrentLimit:number}>('/api/admin/concurrency',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({concurrentLimit:draftLimit})});setData(old=>old?{...old,...result}:old);notify('admin-action','success','同時生成数を保存しました。');await load();});}
  function changeList(name:ListName,search:string,page:number){if(disabled)return;void load({...queries.current,[name]:{search:search.trim(),page}},true);}
  function download(){if(!data)return;const blob=new Blob([JSON.stringify({...data,exportScope:'集計＋各一覧の現在ページ',exportedAt:new Date().toISOString(),costBasis:'USD; JPY conversion 150. Estimates, not an invoice.'},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`wallet-echo-report-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);clear('admin-action');notify('admin-action','success','集計と各一覧の現在ページを保存しました。');}
  const activeList=tab==='overview'?null:tab;
  const pagination=activeList&&data?<Pagination info={data.pagination[activeList]} label={tabs.find(t=>t[0]===activeList)![1]} disabled={disabled} onPage={page=>changeList(activeList,queries.current[activeList].search,page)}/>:null;
  return <Localized><main className="admin-page">
    <header className="topbar"><a className="brand" href="/">Wallet <b>Echo</b></a><span>管理ページ</span><LanguageToggle/>{authenticated&&<button className="secondary-button" disabled={disabled} onClick={()=>void action(async()=>{await api('/api/admin/session',{method:'DELETE'});setAuthenticated(false);setData(null);setError('');clear('admin-load');})}>ログアウト</button>}</header>
    <h1>運営ダッシュボード</h1>
    <div ref={toolbar} className="admin-sticky">
      {authenticated&&<div className="admin-tabs" role="tablist" aria-label="管理メニュー">{tabs.map(([id,label],index)=><button key={id} id={'tab-'+id} role="tab" type="button" aria-selected={tab===id} aria-controls={'panel-'+id} tabIndex={tab===id?0:-1} onClick={()=>selectTab(id)} onKeyDown={e=>{const next=e.key==='ArrowRight'?(index+1)%tabs.length:e.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:-1;if(next>=0){e.preventDefault();selectTab(tabs[next][0]);document.getElementById('tab-'+tabs[next][0])?.focus();}}}>{label}</button>)}</div>}
      <NotificationBar/>
    </div>
    {loading&&!data?<p role="status">確認しています…</p>:!authenticated?<form className="admin-login generator-panel" onSubmit={login}><h2>管理者ログイン</h2><label htmlFor="password">パスワード</label><input id="password" type="password" autoComplete="current-password" required maxLength={512} value={password} aria-describedby={error?'login-error':undefined} onChange={e=>setPassword(e.target.value)}/>{error&&<p id="login-error" className="error">{error}</p>}<button className="generate-button" disabled={disabled}>ログイン</button><p>セッションの有効期間は8時間です。</p>{loadError&&<button type="button" className="secondary-button" onClick={()=>void load()}>接続を再確認</button>}</form>:data&&<>
      <div className="admin-actions"><button className="secondary-button" disabled={disabled} onClick={()=>void load()}>最新の情報に更新</button><button className="secondary-button" disabled={disabled} onClick={download}>集計＋各一覧の現在ページを保存</button><span className="muted">最終更新 {time(updatedAt)}</span></div>
      {loadError&&<p className="error">表示済みのデータを残しています。{loadError} <button type="button" className="secondary-button" disabled={disabled} onClick={()=>void load()}>再取得</button></p>}
      {tabs.filter(([id])=>id!==tab).map(([id])=><section key={id} hidden role="tabpanel" id={'panel-'+id} aria-labelledby={'tab-'+id}/>)}
      <section ref={panel} className="admin-tab-panel" role="tabpanel" id={'panel-'+tab} aria-labelledby={'tab-'+tab} aria-busy={loading} tabIndex={0}>
      {loading&&<p role="status">一覧を読み込んでいます…</p>}
      {tab==='overview'?<>
        <section className="admin-panel"><h2>同時生成数</h2><p>{`実行中 ${data.totals.active}件／設定上限 ${data.concurrentLimit}件`}</p><div className="admin-actions"><label htmlFor="concurrent-limit">同時生成数</label><NativeSelect id="concurrent-limit" value={draftLimit} disabled={disabled} onChange={e=>setDraftLimit(Number(e.target.value))}>{[3,4,5].map(n=><NativeSelectOption key={n} value={n}>{n}</NativeSelectOption>)}</NativeSelect><button className="secondary-button" disabled={disabled||draftLimit===data.concurrentLimit} onClick={()=>void saveConcurrency()}>保存する</button></div><p>上限の変更は次の受付から反映します。実行中の処理は中断しません。</p></section>
        <section className="admin-panel"><h2>利用制限</h2><div className="admin-stats"><article><span>本日の受付数（日本時間）</span><strong>{data.abuse.accepted} / {data.abuse.limits.globalDay}</strong></article><article><span>本日の拒否件数</span><strong>{data.abuse.rejections.filter(r=>r.day===data.abuse.day).reduce((sum,r)=>sum+r.count,0)}</strong></article></div><p><b>受付状態：</b>{data.abuse.stopReason?rejectionLabels[data.abuse.stopReason]:data.totals.active>=data.concurrentLimit?'同時生成数の上限':'受付可能'}</p><p>ブラウザー：1日3回。接続元：直近1時間10回・1日20回。サイト全体：1日100回。日次の枠は日本時間の午前0時に更新します。</p><details><summary>拒否理由（過去30日）</summary><ul>{data.abuse.rejections.map(r=><li key={r.day+r.reason}>{r.day} · {rejectionLabels[r.reason]||'その他'} · {r.count}</li>)}</ul></details></section>
        <section className="admin-panel reception-panel"><div><h2>生成の受付</h2><strong className="reception-state">{data.receptionPaused?'一時停止中':'受付中'}</strong><p>停止中は新規生成と画像の再試行を受け付けません。受付済みの処理と画像の受け取りは継続します。</p></div><button type="button" className="secondary-button" disabled={disabled} onClick={()=>void toggleReception()}>{data.receptionPaused?'受付を再開する':'受付を一時停止する'}</button></section>
        <div className="admin-stats">{[['受付回数',data.totals.attempts],['ウォレット数',data.totals.wallets],['生成完了',data.totals.completed],['失敗した処理',data.totals.failed],['実行中',data.totals.active]].map(([label,v])=><article key={label}><span>{label}</span><strong>{v}</strong></article>)}</div>
        <section className="admin-panel"><h2>API利用コスト（暫定）</h2><p className="cost-total">{money(Object.values(data.totals.cost).reduce((a,b)=>a+b,0))}</p><div className="admin-stats">{(['image','pubfi','jev'] as const).map(k=><article key={k}><span>{{image:'GPT Image 2.5',pubfi:'PubFi',jev:'Jev（概算対象外）'}[k]}</span><strong>${data.totals.cost[k].toFixed(4)}</strong><small>呼び出し {data.totals.calls[k]} 回</small></article>)}</div><p>画像は使用量から算出（{data.totals.measuredImages}回）。未取得・失敗分は1回$0.015で仮計上（{data.totals.estimatedImages}回）。PubFiは1リクエスト$0.001、Jevは概算対象外。無料Credits・税・為替手数料は含まず、1ドル＝150円で表示します。</p><p>計測開始：{time(data.since)}。導入前の{data.totals.legacyJobs}件の費用は未計測です。失敗後に再試行して成功した場合は、失敗・完了の両方に記録します。</p></section>
      </>:activeList&&<section className="admin-panel">
        <h2>{tabs.find(t=>t[0]===tab)![1]}</h2><p>{tab==='wallet'?'ウォレットごとの生成枠と累計受付を確認できます。':tab==='history'?'保存中の直近5,000件までを、50件ずつ表示します。':'保存中の直近500件までを、50件ずつ表示します。'}</p>
        <form className="admin-search" onSubmit={e=>{e.preventDefault();changeList(activeList,drafts[activeList],1);}}><label htmlFor={'search-'+activeList}>アドレスで絞り込み</label><input id={'search-'+activeList} value={drafts[activeList]} maxLength={100} onChange={e=>setDrafts(old=>({...old,[activeList]:e.target.value}))}/><button className="secondary-button" disabled={disabled}>検索</button><button type="button" className="secondary-button" disabled={disabled} onClick={()=>{setDrafts(old=>({...old,[activeList]:''}));changeList(activeList,'',1);}}>クリア</button></form>
        {data.pagination[activeList].search&&<p>適用中の検索：<code>{data.pagination[activeList].search}</code></p>}{pagination}
        {tab==='wallet'?<div className="table-scroll" tabIndex={0} aria-label="ウォレット一覧"><table><thead><tr><th>アドレス</th><th>使用枠</th><th>累計受付</th><th>リセット</th><th>最終受付</th><th>操作</th></tr></thead><tbody>{data.wallets.map(w=><tr key={w.addressType+w.address}><td className="address-cell"><small>{w.addressType.toUpperCase()}</small>{w.address}</td><td>{w.used} / 3</td><td>{w.total} 回</td><td>{w.resets} 回</td><td>{time(w.lastAt)}</td><td><button className="secondary-button" disabled={disabled||w.used===0} onClick={()=>void reset(w.addressType,w.address)}>枠をリセット</button></td></tr>)}</tbody></table></div>:tab==='history'?<div className="table-scroll" tabIndex={0} aria-label="実行履歴一覧"><table><thead><tr><th>日時</th><th>アドレス</th><th>スタイル</th><th>状態</th><th>受付回数</th><th>暫定費用</th></tr></thead><tbody>{data.history.map(h=><tr key={h.id}><td>{time(h.createdAt)}</td><td className="address-cell">{h.address}</td><td>{styleName(h.world)}</td><td><span className={'state-badge state-'+h.status}>{states[h.status]||h.status}</span>{h.error&&<small>{h.error}</small>}</td><td>{h.attempts}</td><td>${Object.values(h.cost).reduce((a,b)=>a+b,0).toFixed(4)}</td></tr>)}</tbody></table></div>:<ul className="admin-logs">{data.logs.map((l,i)=><li key={`${l.at}-${i}`}><time>{time(l.at)}</time><span>{l.event}</span>{l.address&&<code>{l.address}</code>}</li>)}</ul>}
        {!data.pagination[activeList].total&&<p className="admin-empty">{data.pagination[activeList].search?'検索条件に一致するデータがありません。':'まだデータがありません。'}</p>}{pagination}
      </section>}
      </section>
    </>}
  </main></Localized>;
}
