import type { Metadata } from 'next';
import { publicSiteUrl } from '@/lib/sharing';
import './globals.css';
import { NotificationsProvider } from './components/notifications';
import { LanguageProvider } from './components/language';
import './hero.css';
import './language.css';
const siteUrl = publicSiteUrl();
const title = 'Wallet Echo — ウォレットから、もう一人のあなたへ。';
const description = 'Astarのオンチェーン活動から、あなただけのキャラクターイメージを。接続・署名不要。5つの世界観で、もう一人の自分に出会おう。';
export const metadata:Metadata={title,description,
  metadataBase:new URL(siteUrl || 'http://localhost:3000'),
  ...(siteUrl?{alternates:{canonical:siteUrl}}:{}),
  icons:{icon:'/wallet-echo-mark.svg'},openGraph:{images:[{url:'/opengraph-image.png',width:1200,height:630}],type:'website',locale:'ja_JP',siteName:'Wallet Echo',title,description,...(siteUrl?{url:siteUrl}:{})},
  twitter:{card:'summary_large_image',title,description,images:[{url:'/opengraph-image.png',alt:'Wallet Echo — Your wallet. Your other self.'}]},
};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ja"><body><LanguageProvider><NotificationsProvider>{children}</NotificationsProvider></LanguageProvider></body></html>;}
