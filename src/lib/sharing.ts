import { styleName } from './styles';
import { translate, type Language } from './translations';

export function publicSiteUrl(value = process.env.NEXT_PUBLIC_SITE_URL || (typeof window==='undefined'?'':window.location.origin)): string {
  if (!value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    return `${url.origin}/`;
  } catch { return ''; }
}

export function shareText(name: string, style: string, siteUrl = publicSiteUrl(), language: Language = 'ja'): string {
  if(language==='en')return [`My Astar wallet’s Echo is “${translate(name,language)}”.`, `World: ${styleName(style)}`, '#WalletEcho #Astar',publicSiteUrl(siteUrl)].filter(Boolean).join('\n');
  return [`私のAstarウォレットから生まれたEchoは「${name}」でした。`,
    `世界観：${styleName(style)}`, '#WalletEcho #Astar', publicSiteUrl(siteUrl)].filter(Boolean).join('\n');
}

export const xShareUrl = (text: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
