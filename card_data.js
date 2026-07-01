// ============================================================
// カードバトル card_data.js
// Version : 1.1.1
// Updated : 2025-06-30
// Updated : 2025-06-29
// ============================================================

// ============================================================
// card_data.js  ?  カード定義データ
// ============================================================

const CARD_TYPES = {
  NATURE:    "自然信仰",
  CULTURE:   "文化振興",
  TOURISM:   "観光資源",
  DEVELOP:   "観光発展",
  COLORLESS: "無",
};

// ============================================================
// effect キー一覧（game.js側で処理）
//
// ワザ effect:
//   "fansa"              : ダメージ0・ログ表示のみ
//   "sousenkyo"          : 場+トラッシュのクマ系枚数×20追加
//   "kamikudaku"         : 自分の被ダメージ分追加
//   "one_hand_strike"    : 両バトル場エネルギー合計×30追加
//   "onsen_search"       : 山札からポケモン1枚サーチ
//   "jigoku_welcome"     : 相手ベンチ選択・20ダメージ
//   "enma_cho"           : 相手手札を半分ランダムトラッシュ
//   "minkan_kousei"      : 同ターン特性2回以上使用でコスト1減
//   "self_damage_30"     : 自分も30ダメージ（将来用）
//
// 特性 ability.trigger:
//   "passive"            : 常時発動（ダメージ計算時に参照）
//   "once_per_turn"      : 1ターン1回・能動的に使用
//
// 特性 ability.effectKey:
//   "sentaku_no_7"       : 全エネルギー合計×20 被ダメ軽減
//   "ou_no_fukaku"       : たねからのダメージ0（HP条件付き）
//   "jyouhari_kagami"    : 手札差分だけワザコスト軽減
//   "nakama_100"         : 手札エネルギー1枚つけて1ドロー
//   "toubetsu_pr"        : 申告制・エネルギーorグッズサーチ
// ============================================================

const POKEMON_CARDS = [

  // ── たねポケモン ─────────────────────────────────────────

  {
    id: "p001",
    cardType: "pokemon",
    name: "飼育されているクマ",
    stage: 0,
    evolvesFrom: null,
    hp: 80,
    type: CARD_TYPES.NATURE,
    weakness: null,
    resistance: null,
    retreat: 2,
    image: "cards/pokemon_クマ_0_たね.png",
    isEX: false,
    ability: null,
    moves: [
      {
        name: "ファンサ",
        cost: [],
        damage: 0,
        description: "このワザを使用すると、相手プレイヤーは自分に「ファンサしてー」と言わなければならない。それに応えるかどうかは自分で決めてよい。",
        effect: "fansa",
      },
      {
        name: "ひっかく",
        cost: [CARD_TYPES.NATURE],
        damage: 30,
        description: null,
        effect: null,
      },
    ],
  },

  {
    id: "p002",
    cardType: "pokemon",
    name: "温泉街 石像鬼",
    stage: 0,
    evolvesFrom: null,
    hp: 80,
    type: CARD_TYPES.NATURE,
    weakness: null,
    resistance: null,
    retreat: 2,
    image: "cards/pokemon_鬼_0_たね.png",
    isEX: false,
    ability: null,
    moves: [
      {
        name: "温泉街への集客",
        cost: [CARD_TYPES.NATURE],
        damage: 0,
        description: "自分の山札からポケモンを1枚選び、相手に見せて手札に加える。最後に山札を切る。",
        effect: "onsen_search",
      },
    ],
  },

  {
    id: "p003",
    cardType: "pokemon",
    name: "鉄の町 ボルタeX",
    stage: 0,
    evolvesFrom: null,
    hp: 210,
    type: CARD_TYPES.NATURE,
    weakness: null,
    resistance: null,
    retreat: 1,
    image: "cards/pokemon_ボルタ.png",
    isEX: true,
    ability: {
      name: "100種類の仲間たち",
      description: "自分の番に1回使える。自分の手札から「自然信仰エネルギー」を1枚選び、このポケモンに付ける。その後、自分の山札を1枚引く。",
      trigger: "once_per_turn",
      effectKey: "nakama_100",
    },
    moves: [
      {
        name: "[ワン・ハンド・ストライク]",
        cost: [CARD_TYPES.NATURE, CARD_TYPES.NATURE, CARD_TYPES.NATURE],
        damage: 30,
        description: "お互いのバトルポケモンについているエネルギーの数×30ダメージ追加。",
        effect: "one_hand_strike",
      },
    ],
  },

  {
    id: "p004",
    cardType: "pokemon",
    name: "登夢くん",
    stage: 0,
    evolvesFrom: null,
    hp: 120,
    type: CARD_TYPES.NATURE,
    weakness: null,
    resistance: null,
    retreat: 0,
    image: "cards/pokemon_登夢くん.png",
    isEX: false,
    ability: {
      name: "登別市観光PR",
      description: "自分の番に1回使える。相手プレイヤーに観光ポイント(名所)を教え、その場所を知らない場合、自分の山札からエネルギーまたはグッズを1枚手札に加える。",
      trigger: "once_per_turn",
      effectKey: "toubetsu_pr",
    },
    moves: [
      {
        name: "民間から公式へ",
        cost: [CARD_TYPES.NATURE],
        damage: 30,
        description: "このターン自分が特性を2回以上使用していたなら、このワザに必要なエネルギーは1つ減る。",
        effect: "minkan_kousei",
      },
    ],
  },

  // ── 1進化ポケモン ─────────────────────────────────────────

  {
    id: "p005",
    cardType: "pokemon",
    name: "選抜NKB 神7:イナホ",
    stage: 1,
    evolvesFrom: "飼育されているクマ",
    hp: 140,
    type: CARD_TYPES.NATURE,
    weakness: null,
    resistance: null,
    retreat: 1,
    image: "cards/pokemon_クマ_1進化_イナホ.png",
    isEX: false,
    ability: {
      name: "選抜の7頭",
      description: "自分のポケモンが相手ポケモンからワザのダメージを受けるとき、自分の場のエネルギーの枚数×20、受けるダメージが低くなる。この効果は重複する。",
      trigger: "passive",
      effectKey: "sentaku_no_7",
    },
    moves: [
      {
        name: "総選挙",
        cost: [CARD_TYPES.NATURE, CARD_TYPES.NATURE],
        damage: 60,
        description: "自分の場、トラッシュにある「飼育されているクマ」及びその進化先のカードの枚数分、相手ポケモンへ与えるダメージを+20する。",
        effect: "sousenkyo",
      },
    ],
  },

  {
    id: "p006",
    cardType: "pokemon",
    name: "飼育された群れのボス",
    stage: 1,
    evolvesFrom: "飼育されているクマ",
    hp: 150,
    type: CARD_TYPES.NATURE,
    weakness: null,
    resistance: null,
    retreat: 4,
    image: "cards/pokemon_クマ_1進化_ボス.png",
    isEX: false,
    ability: {
      name: "王の風格",
      description: "このポケモンはたねポケモンから受けるワザのダメージは0になる。（自分のHPより相手たねポケモンのHPが高い場合は無効）",
      trigger: "passive",
      effectKey: "ou_no_fukaku",
    },
    moves: [
      {
        name: "かみくだく",
        cost: [CARD_TYPES.NATURE, CARD_TYPES.NATURE],
        damage: 80,
        description: "このポケモンが受けたダメージ分、このワザのダメージに追加する。",
        effect: "kamikudaku",
      },
    ],
  },

  {
    id: "p007",
    cardType: "pokemon",
    name: "歓迎 指差し鬼",
    stage: 1,
    evolvesFrom: "温泉街 石像鬼",
    hp: 90,
    type: CARD_TYPES.NATURE,
    weakness: null,
    resistance: null,
    retreat: 1,
    image: "cards/pokemon_鬼_1進化.png",
    isEX: false,
    ability: null,
    moves: [
      {
        name: "地獄へWelcome",
        cost: [CARD_TYPES.NATURE, CARD_TYPES.NATURE],
        damage: 40,
        description: "相手のベンチポケモン1匹にも20ダメージ。",
        effect: "jigoku_welcome",
      },
    ],
  },

  // ── 2進化ポケモン ─────────────────────────────────────────

  {
    id: "p008",
    cardType: "pokemon",
    name: "閻魔大王 eX",
    stage: 2,
    evolvesFrom: "歓迎 指差し鬼",
    hp: 320,
    type: CARD_TYPES.NATURE,
    weakness: null,
    resistance: null,
    retreat: 2,
    image: "cards/pokemon_鬼_2進化_閻魔大王.png",
    isEX: true,
    ability: {
      name: "浄玻璃の鏡",
      description: "相手の手札の枚数が自分よりも多いなら、このポケモンがワザを使うためのエネルギーは、その枚数分少なくなる。",
      trigger: "passive",
      effectKey: "jyouhari_kagami",
    },
    moves: [
      {
        name: "閻魔帳：善悪の審判",
        cost: [CARD_TYPES.NATURE, CARD_TYPES.NATURE, CARD_TYPES.NATURE, CARD_TYPES.NATURE],
        damage: 240,
        description: "相手の手札の枚数が半分になるようにランダムにトラッシュする。（奇数の場合は半分以下になるようにトラッシュ）",
        effect: "enma_cho",
      },
    ],
  },
];

// ============================================================
// エネルギーカード
// ============================================================
const ENERGY_CARD = {
  id: "e001",
  cardType: "energy",
  name: "自然信仰エネルギー",
  type: CARD_TYPES.NATURE,
  image: "cards/energy_自然信仰エネルギー.png",
};

// ============================================================
// クマ系カードIDセット（総選挙の参照用）
// ============================================================
const KUMA_LINE_IDS = new Set(["p001", "p005", "p006"]);


// ============================================================
// トレーナーズカード定義（15種）
// cardType: "trainer"
// trainerType: "goods" | "tool" | "stadium" | "support"
// effectKey: game.js側で処理する効果キー
// tool_effect: ポケモンの道具の常時効果定義
// tool_move: ポケモンの道具が付与する追加ワザ定義
// ============================================================
const TRAINER_CARDS = [

  // ── グッズ（7種）────────────────────────────────────────────
  {
    id: "g001",
    cardType: "trainer",
    trainerType: "goods",
    name: "NKB総選挙",
    image: "cards/goods_NKB総選挙.png",
    description: "場の「飼育されているクマ」を1匹選び、「選抜NKB 神7:イナホ」に進化させる。場に「飼育された群れのボス」がいる場合、そのボスの最大HPを2倍にする。",
    effectKey: "goods_nkb_sousenkyo",
  },
  {
    id: "g002",
    cardType: "trainer",
    trainerType: "goods",
    name: "登別クマ牧場",
    image: "cards/goods_クマ牧場.png",
    description: "山札からHP90以下のたねポケモンを1枚手札に加える。山札を切る。",
    effectKey: "goods_kuma_bokujyo",
  },
  {
    id: "g003",
    cardType: "trainer",
    trainerType: "goods",
    name: "室蘭やきとり",
    image: "cards/goods_室蘭やきとり.png",
    description: "自分のポケモン1匹のHPを70回復し、そのポケモンのエネルギーを1枚トラッシュする。相手プレイヤーが「やきとりの一平」の価格を正しく答えたら、相手のベンチポケモン1匹のHPも20回復する。",
    effectKey: "goods_yakitori",
    // 正解価格（やきとりの一平の価格）
    correctPrice: 150,
  },
  {
    id: "g004",
    cardType: "trainer",
    trainerType: "goods",
    name: "登別閻魔焼きそば",
    image: "cards/goods_登別閻魔焼きそば.png",
    description: "自分のポケモン1匹のHPを50回復する。今日焼きそばを食べていた場合、ベンチポケモン全てのHPも30回復する。",
    effectKey: "goods_enma_yakisoba",
  },
  {
    id: "g005",
    cardType: "trainer",
    trainerType: "goods",
    name: "日本製鉄株式会社",
    image: "cards/goods_日本製鉄.png",
    description: "お互いのプレイヤーは、自分のトラッシュからエネルギーを1枚選び、バトル場のポケモンに付けてよい。日本製鉄の関連企業に就労している親族がいる場合、追加でベンチポケモンへ1枚付けてもよい。",
    effectKey: "goods_nippon_steel",
  },
  {
    id: "g006",
    cardType: "trainer",
    trainerType: "goods",
    name: "白鳥大橋",
    image: "cards/goods_白鳥大橋.png",
    description: "手札をランダムで1枚トラッシュし、山札から2進化ポケモンを1枚手札に加える。トラッシュしたカードがポケモンでなかった場合、追加で山札からエネルギーを1枚手札に加える。",
    effectKey: "goods_hakucho_bridge",
  },
  {
    id: "g007",
    cardType: "trainer",
    trainerType: "goods",
    name: "鷲別神社",
    image: "cards/goods_鷲別神社.png",
    description: "自分のトラッシュが10枚以上なら、その中から3枚選んで山札に戻す。山札をシャッフルした後、山札から2枚引く。",
    effectKey: "goods_washi_shrine",
  },

  // ── ポケモンの道具（2種）─────────────────────────────────────
  {
    id: "t001",
    cardType: "trainer",
    trainerType: "tool",
    name: "ワザマシン レコレクション",
    image: "cards/pokemondougu_ペンギンの羽.png",
    description: "このカードをつけているポケモンは「レコレクション：ペンギンの羽」を使える。自分の番の終わりにトラッシュする。",
    effectKey: "tool_recollection",
    discardAtTurnEnd: true,  // ターン終了時にトラッシュ
    tool_move: {
      name: "レコレクション：ペンギンの羽",
      cost: [CARD_TYPES.COLORLESS],
      damage: 0,
      description: "自分のベンチポケモンを2匹まで選び、それぞれ進化するカードを山札から1枚ずつ選んで進化させる。山札を切る。",
      effect: "tool_move_recollection",
    },
  },
  {
    id: "t002",
    cardType: "trainer",
    trainerType: "tool",
    name: "金棒",
    image: "cards/pokemondougu_金棒.png",
    description: "このカードをつけているポケモンが与えるダメージ+20。相手が「赤」を着ていれば追加+20、「青」を着ていれば追加+30。",
    effectKey: "tool_kanabo",
    discardAtTurnEnd: false,
    tool_effect: {
      baseDamageBonus: 20,
      colorBonus: { red: 20, blue: 30 },
    },
  },

  // ── スタジアム（1種）────────────────────────────────────────
  {
    id: "s001",
    cardType: "trainer",
    trainerType: "stadium",
    name: "登別地獄谷",
    image: "cards/stadium_地獄谷.png",
    description: "お互いの自然信仰タイプのポケモンは、出したばかりの番（最初の番を除く）でも自然信仰タイプに進化できる。",
    effectKey: "stadium_jigokudani",
  },

  // ── サポート（5種）───────────────────────────────────────────
  {
    id: "sp001",
    cardType: "trainer",
    trainerType: "support",
    name: "安田顕 (TEAM NACS)",
    image: "cards/support_安田顕.png",
    description: "自分の手札を1枚相手に見せ、相手の手札をランダムで1枚見る。自分のトラッシュにある「TEAM NACS」と書かれたカードの枚数分、追加で相手の手札を見られる。",
    effectKey: "support_yasuda_ken",
    teamNacsName: "TEAM NACS",  // トラッシュ検索キーワード
  },
  {
    id: "sp002",
    cardType: "trainer",
    trainerType: "support",
    name: "日本製鉄北日本製鉄所所長 岸本将",
    image: "cards/support_岸本将.png",
    description: "お互いのプレイヤーは手札をすべて山札に戻し、シャッフルした後、それぞれ3枚引く。",
    effectKey: "support_kishimoto",
  },
  {
    id: "sp003",
    cardType: "trainer",
    trainerType: "support",
    name: "博士の研究 (国立大学法人 室蘭工業大学)",
    image: "cards/support_室蘭工業大学.png",
    description: "手札をすべてトラッシュし、山札から6枚引く。",
    effectKey: "support_muroran_univ",
  },
  {
    id: "sp004",
    cardType: "trainer",
    trainerType: "support",
    name: "室蘭満点花火",
    image: "cards/support_室蘭満点花火.png",
    description: "山札からエネルギーを3枚まで手札に加える。今年花火大会に行っていた場合、追加で1枚手札に加える。",
    effectKey: "support_hanabi",
  },
  {
    id: "sp005",
    cardType: "trainer",
    trainerType: "support",
    name: "ボスの指令 (小笠原春一)",
    image: "cards/support_小笠原春一.png",
    description: "相手のベンチポケモンを1匹選び、バトル場のポケモンと入れ替える。",
    effectKey: "support_boss_order",
  },
];

// TRAINER_CARDSをIDで引くヘルパー
function findTrainerById(id) {
  return TRAINER_CARDS.find(c => c.id === id);
}

// ============================================================
// デッキ構築
// ============================================================
function buildDeck() {
  const deck = [];

  const pokemonCounts = {
    p001: 4,  // 飼育されているクマ
    p002: 2,  // 温泉街 石像鬼
    p003: 2,  // 鉄の町 ボルタeX
    p004: 2,  // 登夢くん
    p005: 2,  // 選抜NKB 神7:イナホ
    p006: 2,  // 飼育された群れのボス
    p007: 2,  // 歓迎 指差し鬼
    p008: 1,  // 閻魔大王 eX
  };

  for (const [id, count] of Object.entries(pokemonCounts)) {
    const card = POKEMON_CARDS.find(c => c.id === id);
    for (let i = 0; i < count; i++) {
      deck.push({
        ...card,
        uid: crypto.randomUUID(),
        attachedEnergy: [],
        damage: 0,
        abilityUsedThisTurn: false,
      });
    }
  }

  // トレーナーズ（各2枚）
  const trainerCounts = {
    g001: 2, g002: 2, g003: 2, g004: 2, g005: 2, g006: 2, g007: 2,
    t001: 2, t002: 2,
    s001: 2,
    sp001: 2, sp002: 2, sp003: 2, sp004: 2, sp005: 2,
  };
  for (const [id, count] of Object.entries(trainerCounts)) {
    const card = TRAINER_CARDS.find(c => c.id === id);
    for (let i = 0; i < count; i++) {
      deck.push({ ...card, uid: crypto.randomUUID() });
    }
  }

  const pokemonTotal   = Object.values(pokemonCounts).reduce((a, b) => a + b, 0);
  const trainerTotal   = Object.values(trainerCounts).reduce((a, b) => a + b, 0);
  const energyCount    = 60 - pokemonTotal - trainerTotal;
  for (let i = 0; i < energyCount; i++) {
    deck.push({ ...ENERGY_CARD, uid: crypto.randomUUID() });
  }

  return deck;
}

function buildCpuDeck() {
  return buildDeck();
}
