'use client';
import {Localized,LanguageToggle,useLanguage} from './components/language';
import { useEffect, useRef, useState } from 'react';
import type { GenerationInput, Job } from '@/lib/types';
import { styleName } from '@/lib/styles';
import StylePicker from './components/style-picker';
import Progress from './components/progress';
import ImageResult from './components/image-result';
import CharacterInterpretation from './components/character-interpretation';
import ExampleGallery from './components/example-gallery';
import { activityMetrics } from '@/lib/metrics';
import { NotificationBar, useNotifications } from './components/notifications';

type ServiceStatus={ready:boolean;substrateReady:boolean;receptionPaused:boolean;dailyLimitReached:boolean};
async function api<T>(url:string,init?:RequestInit):Promise<T>{const r=await fetch(url,{...init,cache:'no-store'});const data=await r.json() as T & {error?:{message?:string;code?:string}};if(!r.ok)throw Object.assign(new Error(data.error?.message||'通信できませんでした。'),{code:data.error?.code});return data;}
function Mark(){return <img className="brand-mark" src="/wallet-echo-mark.svg" alt="" width="44" height="44"/>;}
export default function Home(){
  const {language}=useLanguage();
  const {notify,clear}=useNotifications();
  const [errorCode,setErrorCode]=useState(''),[errorScope,setErrorScope]=useState<'form'|'result'>('form');
  const sending=useRef(false);
  const running=useRef(new Set<string>());
  async function execute(id:string){if(running.current.has(id))return;running.current.add(id);try{const r=await fetch(`/api/jobs/${id}/run`,{method:'POST',cache:'no-store'});if(r.status===409)return;if(!r.ok)throw new Error();if(r.headers.get('content-type')?.includes('application/json'))return;const reader=r.body!.getReader(),decoder=new TextDecoder();let pending='';for(;;){const {value,done}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});let pos;while((pos=pending.indexOf('\n'))>=0){const line=pending.slice(0,pos);pending=pending.slice(pos+1);if(!line)continue;const event=JSON.parse(line);if(event.job)setJob(event.job);if(event.error)throw new Error(event.error);}}}catch{setConnectionLost(true);}finally{running.current.delete(id);void refresh();}}
  const [input,setInput]=useState<GenerationInput>({addressType:'evm',address:'',style:'rpg-hero'});
  const [job,setJob]=useState<Job|null>(null),[error,setError]=useState(''),[submitting,setSubmitting]=useState(false),[service,setService]=useState<ServiceStatus|null>(null);
  const [pollPaused,setPollPaused]=useState(false),[connectionLost,setConnectionLost]=useState(false),[startedAt,setStartedAt]=useState('');
  const resultRef=useRef<HTMLDivElement>(null);
  const scrollToResult=()=>requestAnimationFrame(()=>resultRef.current?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}));
  const reconnect=()=>{setConnectionLost(false);setPollPaused(false);setError('');};
  const keyRef=useRef<{serialized:string;key:string}|null>(null);
  const retryKey=useRef<{id:string;key:string}|null>(null);
  const processing=!!job&&['analyzing','judging','generating'].includes(job.status);
  const busy=submitting||processing;
  const serviceMessage=service?.receptionPaused?'ただいま生成の受付を一時停止しています。受付済みの生成と画像の受け取りは引き続き行えます。':service?.dailyLimitReached?'本日の受付上限に達しました。日本時間の午前0時以降にお試しください。':service?.ready===false?'ただいま生成サービスを準備中です。':input.addressType==='substrate'&&service?.substrateReady===false?'Substrateの解析サービスを準備中です。':'';
  useEffect(()=>{if(serviceMessage)notify('service','warning',serviceMessage);else clear('service');},[serviceMessage,notify,clear]);
  useEffect(()=>{if(error)notify('generation-error','error',error);else clear('generation-error');},[error,notify,clear]);
  useEffect(()=>{if(connectionLost)notify('connection','warning','通信が途切れています。処理は継続している可能性があります。結果欄から状況の確認を再開できます。');else clear('connection');},[connectionLost,notify,clear]);
  useEffect(()=>{if(job?.status==='failed')notify('job-failed','error',job.error?.message||'生成に失敗しました。結果欄を確認してください。');else clear('job-failed');},[job?.status,job?.error?.message,notify,clear]);
  useEffect(()=>()=>{for(const id of ['service','generation-error','connection','job-failed'])clear(id);},[clear]);
  const refresh=()=>api<ServiceStatus>('/api/status').then(s=>{setService(s);return true;}).catch(()=>{setService({ready:false,substrateReady:false,receptionPaused:false,dailyLimitReached:false});return false;});
  useEffect(()=>{const tick=()=>{if(document.visibilityState==='visible')void refresh();};const timer=setInterval(tick,30000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick);};},[]);
  useEffect(()=>{void refresh().then(ok=>{if(!ok)return;const id=sessionStorage.getItem('wallet-echo-job');if(id)api<Job>(`/api/jobs/${id}`).then(restored=>{if(restored.status==='complete'&&restored.imageDelivery==='received'){sessionStorage.removeItem('wallet-echo-job');return;}setJob(restored);}).catch(e=>{if(e.code==='NOT_FOUND')sessionStorage.removeItem('wallet-echo-job');});});},[]);
  useEffect(()=>{
    if(!job||!['analyzing','judging','generating'].includes(job.status)||pollPaused)return;
    let cancelled=false;let timer:ReturnType<typeof setTimeout>;let failures=0;
    async function poll(){try{const next=await api<Job>(`/api/jobs/${job!.id}`);if(cancelled)return;setJob(next);setError('');setConnectionLost(false);failures=0;if(next.status==='complete'||next.status==='failed'){void refresh();return;}}catch{if(cancelled)return;setConnectionLost(true);if(++failures>=5){setPollPaused(true);return;}}timer=setTimeout(poll,2000);}
    timer=setTimeout(poll,1200);return()=>{cancelled=true;clearTimeout(timer);};
  },[job?.id,job?.status,pollPaused]);
  async function submit(e:React.FormEvent){e.preventDefault();if(busy||sending.current||!service?.ready||service.receptionPaused||service.dailyLimitReached)return;clear('generation-error');setError('');setErrorCode('');setErrorScope('form');if(!input.address.trim()){setErrorCode('INVALID_ADDRESS');setError('ウォレットアドレスを入力してください。');return;}sending.current=true;setSubmitting(true);setPollPaused(false);setConnectionLost(false);setStartedAt(new Date().toISOString());
    const serialized=JSON.stringify(input);if(keyRef.current?.serialized!==serialized)keyRef.current={serialized,key:crypto.randomUUID()};
    try{const next=await api<Job>('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':keyRef.current!.key},body:serialized});setJob(next);sessionStorage.setItem('wallet-echo-job',next.id);keyRef.current=null;scrollToResult();void execute(next.id);}
    catch(e){setErrorCode((e as {code?:string}).code||'');setError(e instanceof Error?e.message:'生成を開始できませんでした。');void refresh();}finally{sending.current=false;setSubmitting(false);}
  }
  async function retry(){if(!job||busy||sending.current||!service?.ready||service.receptionPaused||service.dailyLimitReached)return;sending.current=true;setSubmitting(true);clear('generation-error');setError('');setErrorCode('');setErrorScope('result');setPollPaused(false);setConnectionLost(false);setStartedAt(new Date().toISOString());if(retryKey.current?.id!==job.id)retryKey.current={id:job.id,key:crypto.randomUUID()};try{const next=await api<Job>(`/api/jobs/${job.id}/retry`,{method:'POST',headers:{'Idempotency-Key':retryKey.current.key}});retryKey.current=null;setJob(next);scrollToResult();void execute(next.id);}catch(e){setError((e as Error).message);void refresh();}finally{sending.current=false;setSubmitting(false);}}
  const character=job?.character;
  return <Localized><main><NotificationBar fixed/>
    <header className="topbar"><a className="brand" href="/" aria-label="Wallet Echo ホーム"><Mark/><span>Wallet <b>Echo</b></span></a><nav><LanguageToggle/><span className="network"><span/>Astar Network</span></nav></header>
    <section className="hero">
      <img className="hero-backdrop" src="/hero-astar-v2.png" alt="黒髪と眼鏡の案内人が、Astarをイメージした星のネットワークを描くイラスト" width="1536" height="1024" fetchPriority="high"/>
      <div className="hero-copy"><div className="eyebrow">YOUR WALLET. YOUR OTHER SELF.</div><h1>ウォレットの足跡が、<br/><span>あなたの姿になる。</span></h1><p className="intro">Astarでのオンチェーン活動から、<br/>あなただけのキャラクターを。<br/>5つの世界観で、もう一人の自分に出会おう。</p><a className="hero-cta" href="#create">キャラクターをつくる <span>↗</span></a><a className="hero-examples-link" href="#examples">完成見本を見る ↓</a><p className="hero-help">接続・署名不要 / 1アドレスにつき3回まで</p></div>
      <span className="hero-caption">WALLET ECHO × ASTAR NETWORK<br/>コンセプトアート</span>
    </section>
    <ExampleGallery busy={busy} onChoose={style=>{setInput(current=>({...current,style}));document.getElementById('create')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});document.getElementById('address')?.focus({preventScroll:true});}}/>
    <section className="studio" id="create">
      <div className="section-heading"><div><h2>あなたの物語を、かたちに。</h2></div></div>
      <div className="studio-grid">
        <form className="generator-panel" onSubmit={submit} noValidate>
          {serviceMessage&&<p className="notice service-notice">△ {serviceMessage}</p>}
          <fieldset disabled={busy}>
            <div className="field-heading"><span className="step-number">01</span><label>ウォレットを選ぶ</label></div>
            <div className="segmented" role="group" aria-label="アドレス形式">{(['evm','substrate'] as const).map(type=><button type="button" key={type} aria-pressed={input.addressType===type} className={input.addressType===type?'selected':''} onClick={()=>{setInput({...input,addressType:type,address:''});setError('');setErrorCode('');}}><span className="option-dot"/>{type==='evm'?'EVM':'Substrate'}<span className="format">{type==='evm'?'0x…':'SS58'}</span></button>)}</div>
            <label className="input-label" htmlFor="address">ウォレットアドレス</label><input id="address" aria-invalid={errorCode==='INVALID_ADDRESS'} aria-describedby={errorCode==='INVALID_ADDRESS'?'address-error':undefined} required maxLength={100} autoComplete="off" spellCheck={false} placeholder={input.addressType==='evm'?'0xから始まるアドレス':'Astar / Substrateのアドレス'} value={input.address} onChange={e=>{setInput({...input,address:e.target.value});if(errorScope==='form'){setError('');setErrorCode('');}}}/>
            {errorCode==='INVALID_ADDRESS'&&<p id="address-error" className="field-error">{error}</p>}
            <p className="field-help"><span>↳</span> {input.addressType==='evm'?'MetaMaskなどのEVMアドレスに対応':'Astar形式・汎用Substrate形式に対応'}。署名は不要です。</p>
            <div className="divider"/>
            <div className="field-heading"><span className="step-number">02</span><label>世界観を選ぶ</label></div>
            <StylePicker value={input.style} onChange={style=>setInput({...input,style})}/>
          </fieldset>
          {error&&errorScope==='form'&&<div className="error inline-error"><strong>! 受付できませんでした</strong><p>{error}</p></div>}
          <button className="generate-button" disabled={busy||service?.receptionPaused||!service?.ready||service?.dailyLimitReached||(input.addressType==='substrate'&&service?.substrateReady===false)} type="submit"><span>{submitting?'受付を確認しています…':busy?'あなたのEchoを生成中…':service?.receptionPaused?'ただいま受付を一時停止中':'あなたのEchoを生み出す'}</span><span aria-hidden="true">↗</span></button>
          <div className="form-foot"><span>生成が完了するまで、このページを開いておいてください</span></div>
          <p className="quota-note">MVPは1アドレスにつき3回まで。受付後の失敗・画像の再試行も1回に含みます。{job&&job.input.address.toLowerCase()===input.address.trim().toLowerCase()&&job.walletRemaining!==undefined&&<strong> このアドレスは残り{job.walletRemaining}回です。</strong>}</p>
        </form>
        <div ref={resultRef} tabIndex={-1} className={`result-panel ${character?'has-result':''}`} aria-busy={processing}>
          <div className="result-top"><span className="eyebrow">YOUR ECHO</span><span className="result-status"><i/>{connectionLost?'接続確認待ち':job?.status==='complete'?'生成完了':busy?'処理中':'生成前'}</span></div>
          {error&&errorScope==='result'&&<div className="error result-error"><strong>! 操作を確認してください</strong><p>{error}</p></div>}
          {!job&&<div className="empty-state"><div className="echo-rings"><span/><span/><span/><Mark/></div><h3>まだ見ぬあなたが、<br/>ここで待っている。</h3><p>ウォレットの足跡を読み解き、<br/>あなただけのキャラクターを描きます。</p><div className="empty-tags"><span>個性</span><i>+</i><span>物語</span><i>+</i><span>イメージ</span></div></div>}
          {processing&&<Progress status={job?.status||'analyzing'} startedAt={job&&['analyzing','judging','generating'].includes(job.status)?job.attemptStartedAt||job.createdAt:startedAt||new Date().toISOString()} disconnected={connectionLost||pollPaused} onReconnect={reconnect}/>}
          {job?.status==='failed'&&<div className="failure-state"><span className="failure-icon">↻</span><h3>少しだけ、ひと休み。</h3><p>{job.error?.message}</p>{job.error?.retryImage&&<button className="secondary-button" onClick={retry} disabled={submitting||service?.receptionPaused}>判定を残して、画像だけ再試行</button>}{!job.error?.retryImage&&<p className="muted">入力を確認し、左のボタンからもう一度お試しください。</p>}</div>}
          {character&&!processing&&<div className="character-result">{job?.status==='complete'&&<ImageResult key={job.id} job={job}/>}<div className="character-meta"><span className="eyebrow">{styleName(character.style||character.worldStyle||'')}</span><h3>{character.name}</h3>{job?.features&&<div className="activity-metrics">{activityMetrics(job.features).map(metric=><div key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.help}</small></div>)}</div>}<CharacterInterpretation character={character}/><div className="reason"><h4>この姿を生んだ活動</h4><p>{character.summary}</p></div></div></div>}
          {job?.features&&!processing&&<details className="evidence"><summary>このEchoのもとになった活動</summary><dl><div><dt>データ取得元</dt><dd>{job.features.source}</dd></div><div><dt>取得件数</dt><dd>{job.features.observedTransactions}件 / 最大{job.features.sampleLimit}件</dd></div><div><dt>範囲</dt><dd>{job.features.truncated?'直近の一部（上限に到達）':'取得できた本人起点の活動'}</dd></div><div><dt>取得日時</dt><dd>{new Date(job.features.fetchedAt).toLocaleString(language==='en'?'en-US':'ja-JP')}</dd></div></dl>{job.features.pendingTransactions>0&&<p>未確定の取引{job.features.pendingTransactions}件は判定から除外しました。</p>}<p>選択した形式のAstar上の活動だけを使用します。資産額、ほかのチェーン、未取得の履歴は判定に含めません。活動指標は取得範囲の事実であり、資産価値や投資の評価ではありません。</p></details>}
          {!job&&<div className="result-bottom"><span>✧</span><span>ひとつのアドレス。ひとつの新しい可能性。</span></div>}
        </div>
      </div>
    </section>
    <section className="how" id="how-it-works"><div className="section-heading"><div><h2>足跡が、個性に変わるまで。</h2></div><p>資産の大きさではなく、あなたの行動から。</p></div><div className="how-grid">{[{n:'01',icon:'⌁',title:'足跡を読み取る',text:'Astar上での活動頻度や操作の種類を取得。ウォレットを接続せずに始められます。'},{n:'02',icon:'✧',title:'個性を見つける',text:'Jevが活動の特徴を読み解き、キャラクターの気質やモチーフを決めます。'},{n:'03',icon:'◈',title:'もう一人の自分に出会う',text:'選んだ世界観で、あなたの個性を一枚のキャラクターイメージに描き出します。'}].map(item=><article key={item.n}><div><span className="how-icon">{item.icon}</span><span className="how-number">{item.n}</span></div><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></section>
    <footer><a className="brand" href="/"><Mark/><span>Wallet <b>Echo</b></span></a><p>あなたの足跡には、まだ知らない物語がある。</p><div className="footer-credit"><span>ASTAR · JEV · GENERATIVE ART</span><span>Created by tksarah</span></div></footer>
    <div className="privacy-note"><p>アドレスや取引IDを除いた活動の集計をJevに送信し、世界観に合わせたキャラクター設定を画像生成サービスに送信します。生成画像は受領まで一時保存し、受領時に削除します。10分後は取得できなくなり、期限切れファイルは次回のアクセス時に削除します。回数制限・運営管理のため、アドレスと累計回数を保持し、直近の実行履歴も記録します。</p><p>不正利用防止のため署名付きCookieを使用します。ブラウザーと接続元の制限記録は48時間、拒否理由の集計は30日保持します。接続元IPは秘密鍵付きハッシュに変換して記録します。</p></div>
  </main></Localized>;
}
