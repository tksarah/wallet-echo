import { meter, providerFor, imageCost } from './meter';
import { AppError } from './errors';
import { execution } from './execution';
// Use the native Node transport; never follow redirects with provider credentials.
export const transport = { fetch: globalThis.fetch.bind(globalThis) };
export async function fetchJson(url: string, init: RequestInit = {}, timeout = 25000): Promise<unknown> {
  const controller = new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline = new Promise<never>((_, reject)=>{timer=setTimeout(()=>{controller.abort();reject(new AppError('UPSTREAM_TIMEOUT','外部サービスの応答が時間内に届きませんでした。しばらく待ってお試しください。',502));},timeout);});
  const sink=meter.getStore(),provider=providerFor(url);
  try {
    if(sink&&provider)await sink({provider,phase:'start'});
    const raw=await Promise.race([requestJson(url,init,execution.getStore()?AbortSignal.any([controller.signal,execution.getStore()!]):controller.signal),deadline]);
    if(sink&&provider)await sink({provider,phase:'success',usd:provider==='image'?imageCost(raw):undefined});
    return raw;
  }catch(error){if(sink&&provider)await sink({provider,phase:'error'});throw error;}
  finally { if(timer)clearTimeout(timer); }
}
async function requestJson(url:string,init:RequestInit,signal:AbortSignal):Promise<unknown>{
  let response: Response;
  try { response = await transport.fetch(url, { ...init, cache: 'no-store', signal, redirect: 'manual' }); }
  catch (error) {
    console.error('Wallet Echo upstream connection failed', {host:new URL(url).hostname,kind:error instanceof Error?error.name:'Error'});
    throw new AppError('UPSTREAM_UNAVAILABLE', '外部サービスに接続できませんでした。繰り返し発生する場合は管理者にお問い合わせください。', 502);
  }
  if(response.status>=300&&response.status<400)throw new AppError('UPSTREAM_REDIRECT','外部サービスの接続先が変更されています。管理者による確認が必要です。',502);
  if (!response.ok) {
    if (response.status === 429) throw new AppError('UPSTREAM_LIMIT', '外部サービスの利用上限に達しています。しばらく待ってお試しください。', 429);
    if ([401,403].includes(response.status)) throw new AppError('UPSTREAM_AUTH', '外部サービスの認証を確認してください。管理者によるAPIキーの確認が必要です。', 503);
    if (response.status === 402) throw new AppError('UPSTREAM_CREDITS', '外部サービスの利用枠を確認してください。自動で有料プランへの変更は行いません。', 503);
    throw new AppError('UPSTREAM_ERROR', '外部サービスからデータを取得できませんでした。もう一度お試しください。', 502);
  }
  try { return await response.json(); } catch { throw new AppError('INVALID_UPSTREAM', '外部サービスの応答形式を確認できませんでした。', 502); }
}
