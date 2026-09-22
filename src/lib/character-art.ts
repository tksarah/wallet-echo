import type { GenerationStyle } from './styles';
type Detail = { label: string; prompt: string };
const d = (label: string, prompt: string): Detail => ({ label, prompt });
export const temperaments = {
  neutral:d('自然体','A balanced relaxed pose with a gentle attentive expression.'),
  calm:d('穏やか','A restful grounded pose, soft gaze and gently lowered shoulders or forequarters.'),
  aggressive:d('躍動的','An energetic forward-leaning pose with a lively expression; no aggression or combat.'),
  curious:d('好奇心豊か','An inquisitive tilted head, alert gaze and a slight lean toward the surroundings.'),
  disciplined:d('着実','A poised stable stance with balanced limbs and carefully arranged details.'),
  chaotic:d('変化に富む','A playful turning pose with asymmetric accents and an animated expression.'),
} as const;
export type Temperament = keyof typeof temperaments;
export const motifLabels = {neutral_echo:'素朴な旅人',first_echo:'はじまり',pathfinder:'探索者',vault_keeper:'守り手',community_sage:'つながりの賢者',signal_weaver:'信号の織り手',steady_hands:'積み重ねる者'} as const;
export type Motif = keyof typeof motifLabels;
// Complete world-specific mapping; no humanoid equipment is imposed on beasts.
const motifs:Record<GenerationStyle,Record<Motif,Detail>> = {
  'rpg-hero':{
    neutral_echo:d('簡素な旅のマントと小さな留め具','A simple traveling cloak with a small plain clasp.'),
    first_echo:d('若葉の留め具と新しい旅袋','A fresh traveling satchel and a budding-leaf cloak clasp.'),
    pathfinder:d('観測用の魔道具と星図模様のマント','A brass magical astrolabe and a cloak decorated with abstract star-map paths, no writing.'),
    vault_keeper:d('結界の盾と重なり合う護符','A protective ward shield and layered geometric talismans, no money or vault imagery.'),
    community_sage:d('灯籠と輪がつながる装飾','A guiding lantern and linked-circle cloak ornaments.'),
    signal_weaver:d('光の糸を結ぶ杖と編み模様','A staff weaving luminous threads and interwoven geometric embroidery.'),
    steady_hands:d('整えられた道具袋と繰り返す幾何学模様','Neatly organized tool pouches and regular repeating geometric trim.'),
  },
  'wallet-beast':{
    neutral_echo:d('自然な毛並みと控えめな光の斑点','Natural fur or scales with subtle luminous spots; no tools held in hands.'),
    first_echo:d('芽のような小さな角と柔らかな毛並み','Small budding horns and soft fresh fur on a wholly non-human creature.'),
    pathfinder:d('周囲を探る触角のような角と星形の斑点','Sensory antenna-like horns and scattered star-like markings across the fur.'),
    vault_keeper:d('重なった守りの鱗と首周りの紋様','Layered protective scales and concentric ward patterns around the neck.'),
    community_sage:d('灯る尾先と輪が連なる毛並み','A softly glowing tail tip and linked-ring patterns in the fur.'),
    signal_weaver:d('光の筋が通る角と編み目のような体表','Luminous branching channels along horns and interwoven hide markings.'),
    steady_hands:d('整った縞模様と層を重ねた尾','Regular repeating stripes and a neatly layered tail.'),
  },
  'cyber-agent':{
    neutral_echo:d('簡素な端末と控えめな装備の光','A simple wrist terminal and subtle suit indicator lights.'),
    first_echo:d('小さな起動灯と軽い基本装備','A small awakening indicator light and lightweight basic expedition gear.'),
    pathfinder:d('観測端末と航路模様の装備','An environmental survey scanner and abstract navigation-path lines on the technical coat.'),
    vault_keeper:d('防護フィールド発生器と重層パネル','A protective field emitter and layered armor panels.'),
    community_sage:d('通信ビーコンと輪を結ぶ光','A communication beacon and interconnected luminous ring accents.'),
    signal_weaver:d('光ファイバーの装具と接続端末','Woven fiber-optic accessories and a compact connection terminal without text.'),
    steady_hands:d('整列した工具と規則的な発光模様','Precisely arranged utility tools and evenly repeating suit lights.'),
  },
  collectible:{
    neutral_echo:d('丸い小物と控えめな台座の模様','A small rounded accessory and subtle pedestal decoration on a molded vinyl toy.'),
    first_echo:d('芽の小物と若葉模様の台座','A tiny sprout accessory and budding-leaf relief on the toy pedestal.'),
    pathfinder:d('ミニチュアの望遠鏡と星の飾り','A miniature telescope accessory and molded star decorations on the vinyl toy.'),
    vault_keeper:d('小さな盾と重なり合う装飾','A tiny rounded shield accessory and layered protective decorative panels.'),
    community_sage:d('小さな灯籠と輪の飾り','A tiny lantern accessory and linked circular charms.'),
    signal_weaver:d('透明な光の糸の小物と編み模様','Translucent thread-shaped accessories and interwoven molded surface patterns.'),
    steady_hands:d('整えたミニ工具と繰り返す台座模様','Neatly arranged miniature tools and regular repeating pedestal relief.'),
  },
  'legendary-card':{
    neutral_echo:d('枠内の簡素な旅装と控えめな縁飾り','Within the card illustration, simple traveling clothes and restrained decorative border details.'),
    first_echo:d('若葉の留め具と芽を描くカード枠','A budding-leaf clasp on the character and sprout ornaments on the complete card border.'),
    pathfinder:d('枠内の観測道具と星図風の縁飾り','An astrolabe held inside the illustration window and abstract star-path border ornament.'),
    vault_keeper:d('枠内の守りの盾と重層的なカード枠','A ward shield inside the illustration window and layered protective border ornament.'),
    community_sage:d('枠内の灯籠と輪がつながる縁飾り','A guiding lantern inside the illustration and linked-ring border ornament.'),
    signal_weaver:d('枠内の光を編む道具と交差する縁飾り','A light-weaving staff within the illustration and interwoven luminous border ornament.'),
    steady_hands:d('枠内の整えた装備と規則的な縁飾り','Neatly arranged equipment within the illustration and evenly repeating border ornament.'),
  },
};
const poses:Record<Temperament,string>={neutral:'力を抜いた自然な姿勢',calm:'落ち着いた姿勢と柔らかな眼差し',aggressive:'前へ踏み出す躍動的な姿勢',curious:'周囲を見渡す好奇心のある姿勢',disciplined:'重心の安定した整った姿勢',chaotic:'振り向く動きと遊び心のある姿勢'};
export function artDirection(style:GenerationStyle,temperament:string,motif:string){
  const t=Object.hasOwn(temperaments,temperament)?temperament as Temperament:'neutral';
  const m=Object.hasOwn(motifLabels,motif)?motif as Motif:'neutral_echo';
  return {temperamentLabel:temperaments[t].label,motifLabel:motifLabels[m],pose:poses[t],motif:motifs[style][m].label,
    prompt:`${temperaments[t].prompt} ${motifs[style][m].prompt} Apply the pose within the required anatomy and framing of this world; preserve the base silhouette, materials and palette.`};
}
