export const worlds = [
  {id:'fantasy', name:'魔法の王国', icon:'✧', description:'杖・マント・魔法の光。壮大な冒険の主人公に。', prompt:'epic painted fantasy, magical staff, flowing cloak, ancient castle, luminous spells'},
  {id:'japan', name:'和風・妖怪', icon:'❀', description:'着物・お面・妖怪。幻想的な和の物語に。', prompt:'Japanese folklore illustration, layered kimono, traditional patterns, spirit lanterns, shrine, yokai-inspired magical atmosphere'},
  {id:'space', name:'宇宙探検', icon:'☄', description:'宇宙服・ロボット・未知の惑星。未来の探検家に。', prompt:'science fiction, astronaut expedition suit, robotics, alien planet, orbital instruments, stars, crisp cinematic illustration'},
  {id:'storybook', name:'絵本の森', icon:'♧', description:'丸い姿・やさしい色・森の仲間。温かな絵本の一員に。', prompt:'cozy storybook watercolor, rounded friendly shapes, soft pastel palette, woodland clothing, whimsical forest, paper texture, gentle expression'},
] as const;
export const worldName = (id:string) => worlds.find(w=>w.id===id)?.name || ({'sci-fi':'宇宙探検',cyberpunk:'ネオンの未来'}[id]) || id;
