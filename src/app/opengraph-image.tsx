import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const alt = 'Wallet Echo — Your wallet. Your other self. Astarの活動から生まれるキャラクター';
export const size = {width:1200,height:630};
export const contentType = 'image/png';
export const dynamic = 'force-static';

export default async function Image() {
  const asset = async (file:string,mime:string) => `data:${mime};base64,${(await readFile(path.join(process.cwd(),'public',file))).toString('base64')}`;
  const [hero,beast,mark] = await Promise.all([asset('examples/rpg-hero-og.png','image/png'),asset('examples/wallet-beast-og.png','image/png'),asset('wallet-echo-mark.svg','image/svg+xml')]);
  return new ImageResponse(<div style={{width:'100%',height:'100%',display:'flex',background:'linear-gradient(120deg,#11192e,#292047)',color:'#f5f7ff',padding:54,fontFamily:'sans-serif'}}>
    <div style={{display:'flex',flexDirection:'column',width:590,justifyContent:'space-between'}}>
      <div style={{display:'flex',alignItems:'center',gap:16,fontSize:44,fontWeight:700}}><img src={mark} width={56} height={56}/><span>Wallet Echo</span></div>
      <div style={{display:'flex',flexDirection:'column',fontSize:61,fontWeight:700,lineHeight:1.12}}><span>YOUR WALLET.</span><span style={{color:'#79e2ff'}}>YOUR</span><span style={{color:'#79e2ff'}}>OTHER SELF.</span></div>
      <div style={{display:'flex',flexDirection:'column',gap:12,fontSize:23,color:'#c2cde7'}}><span>5 worlds. One unique Echo.</span><span style={{fontSize:18,letterSpacing:3}}>ASTAR / JEV / GENERATIVE ART</span></div>
    </div>
    <div style={{display:'flex',position:'relative',width:490,height:522}}>
      <img src={hero} width={340} height={340} style={{position:'absolute',right:0,top:0,borderRadius:24,border:'2px solid #5cbaca'}}/>
      <img src={beast} width={270} height={270} style={{position:'absolute',left:0,bottom:0,borderRadius:24,border:'2px solid #a390d7'}}/>
    </div>
  </div>,size);
}
