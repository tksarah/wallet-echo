'use client';
import {Children,cloneElement,createContext,isValidElement,useContext,useEffect,useState,type ReactNode} from 'react';
import {ToggleGroup,ToggleGroupItem} from '@/components/ui/toggle-group';
import {translate,type Language} from '@/lib/translations';
import '@/lib/translation-details';

const Context=createContext({language:'ja' as Language,setLanguage:(_value:Language)=>{}});
export const useLanguage=()=>useContext(Context);
export function LanguageProvider({children}:{children:ReactNode}){
  const [language,setLanguage]=useState<Language>('ja');
  useEffect(()=>{try{const stored=localStorage.getItem('wallet-echo-language');if(stored==='en'||stored==='ja')setLanguage(stored);}catch{}},[]);
  useEffect(()=>{document.documentElement.lang=language;document.title=language==='en'?'Wallet Echo — Your wallet. Your other self.':'Wallet Echo — ウォレットから、もう一人のあなたへ。';},[language]);
  function choose(value:Language){setLanguage(value);try{localStorage.setItem('wallet-echo-language',value);}catch{}}
  return <Context.Provider value={{language,setLanguage:choose}}>{children}</Context.Provider>;
}
export function LanguageToggle(){
  const {language,setLanguage}=useLanguage();
  return <ToggleGroup type="single" className="language-toggle" value={language} onValueChange={value=>{if(value==='ja'||value==='en')setLanguage(value);}} aria-label="Language / 言語">
    <ToggleGroupItem value="ja" lang="ja" aria-label="日本語に切り替え">日本語</ToggleGroupItem>
    <ToggleGroupItem value="en" lang="en" aria-label="Switch to English">English</ToggleGroupItem>
  </ToggleGroup>;
}

// Translate presentation only. Component props, handlers, IDs, form values and
// request payloads stay intact so switching language cannot restart a job.
export function Localized({children}:{children:ReactNode}){
  const {language}=useLanguage();
  function visit(nodes:ReactNode):ReactNode{
    return Children.map(nodes,node=>{
      if(typeof node==='string')return translate(node,language);
      if(!isValidElement<Record<string,unknown>>(node))return node;
      const props:Record<string,unknown>={};
      if(typeof node.type==='string')for(const key of ['alt','title','placeholder','aria-label']){
        if(typeof node.props[key]==='string')props[key]=translate(node.props[key],language);
      }
      if(node.props.children!==undefined)props.children=visit(node.props.children as ReactNode);
      return cloneElement(node,props);
    });
  }
  return <>{visit(children)}</>;
}
