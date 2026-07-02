// ============================================================
// カードバトル game.js
// Version : 1.6.0
// Updated : 2026-07-02
// ============================================================

// ============================================================
// game.js  ?  ゲームロジック
// ============================================================

const PHASE = {
  SETUP:       "setup",
  PLAYER_TURN: "player_turn",
  CPU_TURN:    "cpu_turn",
  GAME_OVER:   "game_over",
  // 中断フェーズ（プレイヤー入力待ち）
  WAIT_SETUP_ACTIVE:   "wait_setup_active",   // ゲーム開始：バトル場選択待ち
  WAIT_SETUP_BENCH:    "wait_setup_bench",    // ゲーム開始：ベンチ配置選択待ち
  WAIT_DRAW:           "wait_draw",           // ターン開始ドロー待ち
  WAIT_BENCH_TARGET:   "wait_bench_target",   // 地獄へWelcome ベンチ選択
  WAIT_ONSEN_SEARCH:   "wait_onsen_search",   // 温泉街への集客 サーチ待ち
  WAIT_PR_ANSWER:      "wait_pr_answer",      // 登別市観光PR 申告待ち
  // トレーナーズ待機フェーズ
  WAIT_TRAINER_TARGET:  "wait_trainer_target",  // 回復対象ポケモン選択
  WAIT_TRAINER_SELECT:  "wait_trainer_select",  // 汎用選択（トラッシュ・手札・山札）
  WAIT_TRAINER_ANSWER:  "wait_trainer_answer",  // 申告待ち（価格・花火等）
  WAIT_TRAINER_BENCH_SELECT: "wait_trainer_bench_select", // ベンチ選択系
  // レコレクション（ベンチ進化）専用フェーズ
  WAIT_RECOLLECTION_BENCH:  "wait_recollection_bench",  // 進化させるベンチポケモン選択
  WAIT_RECOLLECTION_EVOLVE: "wait_recollection_evolve", // 山札から進化先を選択
};

class GameState {
  constructor() {
    this.phase        = PHASE.SETUP;
    this.turn         = 0;
    this.winner       = null;
    this.log          = [];
    this.player       = this._initSide();
    this.cpu          = this._initSide();
    this.turnFlags    = this._initTurnFlags();
    // 中断フェーズ用コンテキスト
    this.pendingContext = null;
    // 場のスタジアム（effectKey文字列 or null）
    this.stadium      = null;
  }

  _initSide() {
    return {
      deck:        [],
      hand:        [],
      bench:       [],
      active:      null,
      discard:     [],
      prizes:      [],
      prizesTaken: 0,
    };
  }

  _initTurnFlags() {
    return {
      drawn:           false,
      attachedEnergy:  false,
      attacked:        false,
      retreated:       false,
      abilityUseCount: 0,
      supportUsed:     false, // サポートはターンに1枚
    };
  }
}

// ============================================================
// GameEngine
// ============================================================
class GameEngine {
  constructor(onStateChange) {
    this.state          = new GameState();
    this.onStateChange  = onStateChange;
  }

  // ----------------------------------------------------------
  // セットアップ
  // ----------------------------------------------------------
  setup() {
    const s = this.state;
    s.player.deck = this._shuffle(buildDeck());
    s.cpu.deck    = this._shuffle(buildCpuDeck());

    s.player.prizes = s.player.deck.splice(0, 6);
    s.cpu.prizes    = s.cpu.deck.splice(0, 6);

    this._drawInitialHand("player");
    this._drawInitialHand("cpu");

    // CPU は自動配置
    this._autoPlaceActive("cpu");
    this._autoPlaceBench("cpu", 3);

    // プレイヤーはバトル場を手動選択
    s.phase = PHASE.WAIT_SETUP_ACTIVE;
    s.turn  = 1;
    this._log("手札を確認して、バトル場に出すたねポケモンを選んでください。");
    this._notify();
  }

  // プレイヤーがバトル場のたねを選択
  setupSelectActive(cardUid) {
    if (this.state.phase !== PHASE.WAIT_SETUP_ACTIVE) return;
    const s   = this.state.player;
    const idx = s.hand.findIndex(c => c.uid === cardUid);
    if (idx === -1) return this._err("カードが手札にありません");
    const card = s.hand[idx];
    if (card.cardType === "energy" || card.stage !== 0)
      return this._err("たねポケモンを選んでください");

    s.active = this._makeBattleCopy(card);
    s.hand.splice(idx, 1);
    this.state.phase = PHASE.WAIT_SETUP_BENCH;
    this._log(`${card.name} をバトル場に出した！残りのたねをベンチに出せます。`);
    this._notify();
  }

  // プレイヤーがベンチにたねを追加
  setupAddBench(cardUid) {
    if (this.state.phase !== PHASE.WAIT_SETUP_BENCH) return;
    const s = this.state.player;
    if (s.bench.length >= 4) return this._err("ベンチが満員です（最大4体）");
    const idx = s.hand.findIndex(c => c.uid === cardUid);
    if (idx === -1) return this._err("カードが手札にありません");
    const card = s.hand[idx];
    if (card.cardType === "energy" || card.stage !== 0)
      return this._err("たねポケモンを選んでください");

    s.bench.push(this._makeBattleCopy(card));
    s.hand.splice(idx, 1);
    this._log(`${card.name} をベンチに出した！（ベンチ: ${s.bench.length}体）`);
    this._notify();
  }

  // セットアップ完了（ベンチ配置終了）→ ドローフェーズへ
  setupComplete() {
    if (this.state.phase !== PHASE.WAIT_SETUP_BENCH) return;
    this.state.phase = PHASE.WAIT_DRAW;
    this._log("セットアップ完了！カードを1枚引いてください。");
    this._notify();
  }

  _drawInitialHand(side) {
    const s = this.state[side];
    let attempts = 0;
    do {
      if (s.hand.length > 0) {
        s.deck.push(...s.hand);
        s.hand = [];
        s.deck = this._shuffle(s.deck);
        if (side === "player") this._log("マリガン：手札を引き直します。");
      }
      s.hand = s.deck.splice(0, 7);
      attempts++;
    } while (
      !s.hand.some(c => c.cardType !== "energy" && c.stage === 0) &&
      attempts < 5
    );
  }

  _autoPlaceActive(side) {
    const s    = this.state[side];
    const seed = s.hand.find(c => c.cardType !== "energy" && c.stage === 0);
    if (seed) {
      s.active = this._makeBattleCopy(seed);
      s.hand   = s.hand.filter(c => c.uid !== seed.uid);
    }
  }

  _autoPlaceBench(side, max) {
    const s     = this.state[side];
    const seeds = s.hand.filter(c => c.cardType !== "energy" && c.stage === 0);
    seeds.slice(0, max).forEach(card => {
      if (s.bench.length < 5) {
        s.bench.push(this._makeBattleCopy(card));
        s.hand = s.hand.filter(c => c.uid !== card.uid);
      }
    });
  }

  _makeBattleCopy(card) {
    return { ...card, attachedEnergy: [], damage: 0, abilityUsedThisTurn: false };
  }

  // ----------------------------------------------------------
  // プレイヤーアクション
  // ----------------------------------------------------------

  playerDraw() {
    if (this.state.phase !== PHASE.PLAYER_TURN && this.state.phase !== PHASE.WAIT_DRAW)
      return this._err("あなたのターンではありません");
    if (this.state.turnFlags.drawn) return this._err("ドローはターン開始時に1回だけです");
    const s = this.state.player;
    if (s.deck.length === 0) {
      this._log("デッキが切れました！あなたの負けです。");
      this._endGame("cpu"); return;
    }
    s.hand.push(s.deck.shift());
    this.state.turnFlags.drawn = true;
    if (this.state.phase === PHASE.WAIT_DRAW) this.state.phase = PHASE.PLAYER_TURN;
    this._log(`カードを1枚引いた。（手札: ${s.hand.length}枚）`);
    this._notify();
  }

  playToBench(cardUid) {
    if (this.state.phase !== PHASE.PLAYER_TURN) return this._err("あなたのターンではありません");
    const s = this.state.player;
    if (s.bench.length >= 4) return this._err("ベンチが満員です（最大4体）");
    const idx  = s.hand.findIndex(c => c.uid === cardUid);
    if (idx === -1) return this._err("カードが手札にありません");
    const card = s.hand[idx];
    if (card.cardType === "energy") return this._err("エネルギーはベンチに出せません");
    if (card.stage !== 0) return this._err("たねポケモン以外はベンチに直接出せません");
    s.bench.push({ ...this._makeBattleCopy(card), justPlacedThisTurn: true });
    s.hand.splice(idx, 1);
    this._log(`${card.name} をベンチに出した！`);
    this._notify();
  }

  attachEnergy(energyUid, targetUid) {
    if (this.state.phase !== PHASE.PLAYER_TURN) return this._err("あなたのターンではありません");
    if (this.state.turnFlags.attachedEnergy) return this._err("エネルギーは1ターンに1枚しかつけられません");
    const s    = this.state.player;
    const eIdx = s.hand.findIndex(c => c.uid === energyUid);
    if (eIdx === -1) return this._err("エネルギーカードが手札にありません");
    const energy = s.hand[eIdx];
    if (energy.cardType !== "energy") return this._err("エネルギーカードを選んでください");
    const target = this._findPokemonByUid("player", targetUid);
    if (!target) return this._err("ポケモンが見つかりません");
    target.attachedEnergy.push({ ...energy });
    s.hand.splice(eIdx, 1);
    this.state.turnFlags.attachedEnergy = true;
    this._log(`${target.name} にエネルギーをつけた！（合計: ${target.attachedEnergy.length}個）`);
    this._notify();
  }

  evolve(handCardUid, targetUid) {
    if (this.state.phase !== PHASE.PLAYER_TURN) return this._err("あなたのターンではありません");
    if (this.state.turn === 1) return this._err("1ターン目は進化できません");
    const s   = this.state.player;
    const idx = s.hand.findIndex(c => c.uid === handCardUid);
    if (idx === -1) return this._err("カードが手札にありません");
    const evoCard = s.hand[idx];
    const target  = this._findPokemonByUid("player", targetUid);
    if (!target) return this._err("進化先のポケモンが見つかりません");
    if (evoCard.evolvesFrom !== target.name) return this._err(`${evoCard.name} は ${target.name} から進化できません`);

    // 登別地獄谷：出したばかりのたねでも自然信仰タイプは進化可
    const stadiumAllows = this.state.stadium === "stadium_jigokudani"
      && target.type === CARD_TYPES.NATURE;
    if (!stadiumAllows && target.justPlacedThisTurn)
      return this._err("出したばかりのポケモンはこのターン進化できません");

    const evolved = { ...evoCard, uid: target.uid, attachedEnergy: target.attachedEnergy, damage: target.damage, abilityUsedThisTurn: false };
    if (s.active && s.active.uid === target.uid) s.active = evolved;
    else {
      const bi = s.bench.findIndex(c => c.uid === target.uid);
      if (bi !== -1) s.bench[bi] = evolved;
    }
    s.hand.splice(idx, 1);
    this._log(`${target.name} が ${evoCard.name} に進化した！`);
    this._notify();
  }

  retreat(benchUid) {
    if (this.state.phase !== PHASE.PLAYER_TURN) return this._err("あなたのターンではありません");
    if (this.state.turnFlags.retreated)  return this._err("すでにこのターンににげています");
    if (this.state.turnFlags.attacked)   return this._err("ワザを使った後はにげられません");
    const s      = this.state.player;
    const active = s.active;
    if (!active) return this._err("バトル場にポケモンがいません");
    const cost   = active.retreat;
    if (active.attachedEnergy.length < cost) return this._err(`にげるには ${cost} 個のエネルギーが必要です`);
    const bi = s.bench.findIndex(c => c.uid === benchUid);
    if (bi === -1) return this._err("ベンチのポケモンを選んでください");
    const removedEnergy = active.attachedEnergy.splice(0, cost);
    s.discard.push(...removedEnergy);
    const newActive = s.bench.splice(bi, 1)[0];
    s.bench.push(active);
    s.active = newActive;
    this.state.turnFlags.retreated = true;
    this._log(`${active.name} がにげて、${newActive.name} がバトル場に出た！（エネルギー${cost}個をトラッシュ）`);
    this._notify();
  }

  // ----------------------------------------------------------
  // 特性使用（能動的）
  // ----------------------------------------------------------
  useAbility(pokemonUid) {
    if (this.state.phase !== PHASE.PLAYER_TURN) return this._err("あなたのターンではありません");
    const pokemon = this._findPokemonByUid("player", pokemonUid);
    if (!pokemon || !pokemon.ability) return this._err("特性を持つポケモンが見つかりません");
    if (pokemon.ability.trigger !== "once_per_turn") return this._err("この特性は手動では使えません");
    if (pokemon.abilityUsedThisTurn) return this._err(`${pokemon.ability.name} はこのターンすでに使用しました`);

    const key = pokemon.ability.effectKey;
    if (key === "nakama_100")   return this._abilityNakama100(pokemon);
    if (key === "toubetsu_pr")  return this._abilityToubetsuPR(pokemon);
    return this._err("未実装の特性です");
  }

  // 100種類の仲間たち：手札の自然信仰エネルギー1枚をこのポケモンにつけて1ドロー
  _abilityNakama100(pokemon) {
    const s         = this.state.player;
    const energyIdx = s.hand.findIndex(c => c.cardType === "energy" && c.type === CARD_TYPES.NATURE);
    if (energyIdx === -1) return this._err("手札に自然信仰エネルギーがありません");
    const energy = s.hand.splice(energyIdx, 1)[0];
    pokemon.attachedEnergy.push(energy);
    // 1ドロー
    if (s.deck.length > 0) s.hand.push(s.deck.shift());
    pokemon.abilityUsedThisTurn = true;
    this.state.turnFlags.abilityUseCount++;
    this._log(`特性「100種類の仲間たち」：${pokemon.name} にエネルギーをつけて1枚ドロー！`);
    this._notify();
  }

  // 登別市観光PR：申告制でエネルギーorグッズサーチ
  _abilityToubetsuPR(pokemon) {
    pokemon.abilityUsedThisTurn = true;
    this.state.turnFlags.abilityUseCount++;
    this._log(`特性「登別市観光PR」：相手に観光名所を紹介！知っているか申告してください。`);
    this.state.phase          = PHASE.WAIT_PR_ANSWER;
    this.state.pendingContext = { pokemon, ability: "toubetsu_pr" };
    this._notify();
  }

  // 登別市観光PR 申告受付（プレイヤーからの申告 or CPUランダム）
  answerPR(knows) {
    if (this.state.phase !== PHASE.WAIT_PR_ANSWER) return;
    this.state.phase = PHASE.PLAYER_TURN;
    this._applyPREffect(knows);
  }

  // CPUがプレイヤーの特性を受けた場合はランダム判定
  _cpuAnswerPR() {
    const knows = Math.random() < 0.5;
    this._log(`CPU判定：${knows ? "知っていた" : "知らなかった"}！`);
    this._applyPREffect(knows);
  }

  _applyPREffect(knows) {
    if (knows) {
      this._log("相手は知っていた。効果なし。");
    } else {
      const s = this.state.player;
      const idx = s.deck.findIndex(c => c.cardType === "energy");
      if (idx !== -1) {
        const card = s.deck.splice(idx, 1)[0];
        s.hand.push(card);
        s.deck = this._shuffle(s.deck);
        this._log(`相手は知らなかった！山札から ${card.name} を手札に加えた。`);
      } else {
        this._log("相手は知らなかったが、山札にエネルギーがなかった。");
      }
    }
    this.state.pendingContext = null;
    this._notify();
  }

  // ----------------------------------------------------------
  // ワザを使う
  // ----------------------------------------------------------
  attack(moveIndex) {
    if (this.state.phase !== PHASE.PLAYER_TURN) return this._err("あなたのターンではありません");
    if (this.state.turnFlags.attacked)           return this._err("すでにワザを使いました");
    const attacker = this.state.player.active;
    const defender = this.state.cpu.active;
    if (!attacker) return this._err("バトル場にポケモンがいません");
    if (!defender) return this._err("相手のバトル場にポケモンがいません");
    const move = attacker.moves[moveIndex];
    if (!move)   return this._err("ワザが存在しません");

    // コスト計算（浄玻璃の鏡によるコスト軽減込み）
    const effectiveCost = this._getEffectiveCost(attacker, move, "player");
    if (!this._canUseMove(attacker, effectiveCost)) {
      return this._err(`エネルギーが足りません`);
    }

    this.state.turnFlags.attacked = true;

    // ワザ効果処理
    const effect = move.effect;

    // ファンサ：ダメージなし・ログのみ
    if (effect === "fansa") {
      this._log(`${attacker.name} の ファンサ！「ファンサしてー！」`);
      this._afterAttack();
      return;
    }

    // ダメージ計算
    let baseDmg = this._calcDamage(move, attacker, defender, "player", moveIndex);

    // ダメージを与える前に「地獄へWelcome」のベンチ選択が必要
    if (effect === "jigoku_welcome") {
      this._applyDamage(defender, baseDmg, "cpu");
      this._log(`${attacker.name} の 地獄へWelcome！ ${defender.name} に ${baseDmg} ダメージ！`);
      this._checkKO("cpu");
      if (this.state.phase === PHASE.GAME_OVER) { this._notify(); return; }
      // ベンチ選択フェーズへ
      if (this.state.cpu.bench.length > 0) {
        this.state.phase          = PHASE.WAIT_BENCH_TARGET;
        this.state.pendingContext = { damage: 20, side: "cpu" };
        this._log("相手ベンチのポケモンを1体選んで20ダメージを与えてください。");
        this._notify();
        return;
      } else {
        this._log("相手にベンチポケモンがいないため追加ダメージなし。");
        this._afterAttack();
        return;
      }
    }

    // 通常ダメージ適用
    this._applyDamage(defender, baseDmg, "cpu");
    this._log(`${attacker.name} の ${move.name}！ ${defender.name} に ${baseDmg} ダメージ！`);

    // 閻魔帳：善悪の審判 → 相手手札を半分トラッシュ
    if (effect === "enma_cho") {
      const h     = this.state.cpu.hand;
      const trash = Math.floor(h.length / 2);
      for (let i = 0; i < trash; i++) {
        const ri = Math.floor(Math.random() * h.length);
        this.state.cpu.discard.push(h.splice(ri, 1)[0]);
      }
      this._log(`閻魔帳の効果：CPUの手札を ${trash} 枚トラッシュした！（残り: ${h.length}枚）`);
    }

    this._checkKO("cpu");
    if (this.state.phase === PHASE.GAME_OVER) { this._notify(); return; }
    this._afterAttack();
  }

  // 地獄へWelcome ベンチ選択確定
  selectBenchTarget(benchUid) {
    if (this.state.phase !== PHASE.WAIT_BENCH_TARGET) return;
    const ctx  = this.state.pendingContext;
    const side = ctx.side; // "cpu" or "player"
    const bench = this.state[side].bench;
    const target = bench.find(c => c.uid === benchUid);
    if (!target) return this._err("ベンチのポケモンを選んでください");

    this._applyDamage(target, ctx.damage, side);
    this._log(`${target.name} に ${ctx.damage} ダメージ！`);
    this._checkKO(side);
    this.state.phase          = PHASE.PLAYER_TURN;
    this.state.pendingContext = null;
    if (this.state.phase === PHASE.GAME_OVER) { this._notify(); return; }
    this._afterAttack();
  }

  // ----------------------------------------------------------
  // トレーナーズ使用キャンセル（手札に戻す）
  // ----------------------------------------------------------
  cancelTrainer() {
    const waitPhases = [
      PHASE.WAIT_TRAINER_TARGET, PHASE.WAIT_TRAINER_SELECT,
      PHASE.WAIT_TRAINER_ANSWER, PHASE.WAIT_TRAINER_BENCH_SELECT,
    ];
    if (!waitPhases.includes(this.state.phase)) return this._err("キャンセルできる状態ではありません");
    const ctx = this.state.pendingContext;
    if (!ctx || !ctx.card) return this._err("キャンセルできない処理です（既に確定済み）");
    const lockedTypes = [
      "kanabo_color", "yakitori_price", "yakisoba_check",
      "nippon_steel_bonus", "nippon_steel_bench_energy", "nippon_steel_bench_energy_select",
      "yasuda_peek", "hakucho_stage2_search",
    ];
    if (lockedTypes.includes(ctx.type)) return this._err("効果が既に発動しているためキャンセルできません");
    const s = this.state.player;
    s.hand.push(ctx.card);
    // サポート使用フラグを戻す
    if (ctx.card.trainerType === "support") this.state.turnFlags.supportUsed = false;
    this._log(`${ctx.card.name} の使用をキャンセルし、手札に戻した。`);
    this.state.pendingContext = null;
    this.state.phase = PHASE.PLAYER_TURN;
    this._notify();
  }

  // ----------------------------------------------------------
  // トレーナーズ使用
  // ----------------------------------------------------------
  useTrainer(cardUid) {
    if (this.state.phase !== PHASE.PLAYER_TURN) return this._err("あなたのターンではありません");
    const s   = this.state.player;
    const idx = s.hand.findIndex(c => c.uid === cardUid);
    if (idx === -1) return this._err("カードが手札にありません");
    const card = s.hand[idx];
    if (card.cardType !== "trainer") return this._err("トレーナーズカードを選んでください");
    if (card.trainerType === "support" && this.state.turnFlags.supportUsed)
      return this._err("サポートはターンに1枚しか使えません");

    if (card.trainerType === "tool") {
      s.hand.splice(idx, 1);
      const candidates = [s.active, ...s.bench].filter(Boolean).filter(p => !p.attachedTool);
      if (candidates.length === 0) {
        s.hand.splice(idx, 0, card);
        return this._err("道具をつけられるポケモンがいません（全員道具持ち）");
      }
      const ctxType = card.effectKey === "tool_kanabo" ? "tool_attach_kanabo" : "tool_attach";
      this.state.pendingContext = { type: ctxType, card, candidates };
      this.state.phase = PHASE.WAIT_TRAINER_TARGET;
      this._log(`${card.name}：つけるポケモンを選んでください。`);
      this._notify(); return;
    }
    if (card.trainerType === "stadium") {
      s.hand.splice(idx, 1);
      this._useStadium(card); return;
    }
    if (card.trainerType === "support") {
      if (card.effectKey === "support_boss_order") {
        const cpuBench = this.state.cpu.bench.filter(Boolean);
        if (cpuBench.length === 0) return this._err("相手にベンチポケモンがいないため使用できません");
      }
      s.hand.splice(idx, 1);
      this.state.turnFlags.supportUsed = true;
      this._useSupport(card); return;
    }
    if (card.trainerType === "goods") {
      if (card.effectKey === "goods_nkb_sousenkyo") {
        const hasKuma = [s.active, ...s.bench].some(p => p && p.name === "飼育されているクマ");
        if (!hasKuma) return this._err("場に飼育されているクマがいないため使用できません");
      }
      s.hand.splice(idx, 1);
      this._useGoods(card); return;
    }
  }

  _useStadium(card) {
    this.state.stadium = card.effectKey;
    this._log(`スタジアム「${card.name}」が場に出た！`);
    this._notify();
  }

  _useSupport(card) {
    const s = this.state.player;
    switch (card.effectKey) {
      case "support_kishimoto": {
        // 使用した岸本将は先にトラッシュへ（手札からは既に除去済み）
        s.discard.push(card);
        // 残った手札を山札に戻してシャッフル→3ドロー
        s.deck.push(...s.hand); s.hand = []; s.deck = this._shuffle(s.deck);
        const cs = this.state.cpu;
        cs.deck.push(...cs.hand); cs.hand = []; cs.deck = this._shuffle(cs.deck);
        for (let i = 0; i < 3 && s.deck.length; i++) s.hand.push(s.deck.shift());
        for (let i = 0; i < 3 && cs.deck.length; i++) cs.hand.push(cs.deck.shift());
        this._log("岸本将：お互い手札を戻し、それぞれ3枚ドロー！");
        this._notify(); break;
      }
      case "support_muroran_univ": {
        s.discard.push(...s.hand); s.hand = [];
        for (let i = 0; i < 6 && s.deck.length; i++) s.hand.push(s.deck.shift());
        s.discard.push(card);
        this._log("博士の研究：手札をトラッシュして6枚ドロー！");
        this._notify(); break;
      }
      case "support_hanabi": {
        this.state.pendingContext = { type: "hanabi_check", card };
        this.state.phase = PHASE.WAIT_TRAINER_ANSWER;
        this._notify(); break;
      }
      case "support_yasuda_ken": {
        if (s.hand.length === 0) { this._log("手札がありません。"); this._notify(); break; }
        const shown = s.hand[Math.floor(Math.random() * s.hand.length)];
        const nacsTrash = s.discard.filter(c => c.name && c.name.includes("TEAM NACS")).length;
        const peekCount = Math.min(1 + nacsTrash, this.state.cpu.hand.length);
        const peekCards = [];
        const usedIdx = new Set();
        while (peekCards.length < peekCount) {
          const ri = Math.floor(Math.random() * this.state.cpu.hand.length);
          if (!usedIdx.has(ri)) { usedIdx.add(ri); peekCards.push(this.state.cpu.hand[ri]); }
        }
        this.state.pendingContext = { type: "yasuda_peek", card, shown, peekCards };
        this.state.phase = PHASE.WAIT_TRAINER_ANSWER;
        this._notify(); break;
      }
      case "support_boss_order": {
        const cpuBench = this.state.cpu.bench.filter(Boolean);
        this.state.pendingContext = { type: "boss_order", card, candidates: cpuBench };
        this.state.phase = PHASE.WAIT_TRAINER_BENCH_SELECT;
        this._notify(); break;
      }
      default:
        this.state.player.discard.push(card);
        this._log(`${card.name} を使用した。`);
        this._notify();
    }
  }

  _useGoods(card) {
    const s = this.state.player;
    switch (card.effectKey) {
      case "goods_nkb_sousenkyo": {
        const kumas = [s.active, ...s.bench].filter(p => p && p.name === "飼育されているクマ");
        if (kumas.length === 0) { this._log("場に飼育されているクマがいません。"); this._notify(); break; }
        this.state.pendingContext = { type: "nkb_sousenkyo_select", card, candidates: kumas };
        this.state.phase = PHASE.WAIT_TRAINER_TARGET;
        this._notify(); break;
      }
      case "goods_kuma_bokujyo": {
        const seeds = s.deck.filter(c => c.stage === 0 && c.hp <= 90 && c.cardType !== "energy");
        if (seeds.length === 0) { this._log("山札にHP90以下のたねポケモンがありません。"); this._notify(); break; }
        this.state.pendingContext = { type: "kuma_bokujyo_search", card, candidates: seeds };
        this.state.phase = PHASE.WAIT_TRAINER_SELECT;
        this._notify(); break;
      }
      case "goods_yakitori": {
        const targets = [s.active, ...s.bench].filter(Boolean);
        if (targets.length === 0) { this._log("対象ポケモンがいません。"); this._notify(); break; }
        this.state.pendingContext = { type: "yakitori_target", card, candidates: targets };
        this.state.phase = PHASE.WAIT_TRAINER_TARGET;
        this._notify(); break;
      }
      case "goods_enma_yakisoba": {
        const targets2 = [s.active, ...s.bench].filter(Boolean);
        if (targets2.length === 0) { this._log("対象ポケモンがいません。"); this._notify(); break; }
        this.state.pendingContext = { type: "yakisoba_target", card, candidates: targets2 };
        this.state.phase = PHASE.WAIT_TRAINER_TARGET;
        this._notify(); break;
      }
      case "goods_nippon_steel": {
        const myEnergies = s.discard.filter(c => c.cardType === "energy");
        if (myEnergies.length === 0) {
          s.discard.push(card);
          this._log("日本製鉄：トラッシュにエネルギーがありません。");
          this._notify(); break;
        }
        this.state.pendingContext = { type: "nippon_steel", card, candidates: myEnergies };
        this.state.phase = PHASE.WAIT_TRAINER_SELECT;
        this._notify(); break;
      }
      case "goods_hakucho_bridge": {
        if (s.hand.length === 0) { this._log("手札がありません。"); this._notify(); break; }
        const ri = Math.floor(Math.random() * s.hand.length);
        const trashed = s.hand.splice(ri, 1)[0];
        s.discard.push(trashed);
        this._log(`白鳥大橋：${trashed.name} をトラッシュした。`);
        const stage2 = s.deck.filter(c => c.stage === 2);
        if (stage2.length === 0) { this._log("山札に2進化ポケモンがありません。"); this._notify(); break; }
        const extraEnergy = (trashed.cardType !== "pokemon" && trashed.cardType !== "energy" && trashed.stage === undefined);
        this.state.pendingContext = { type: "hakucho_stage2_search", card, candidates: stage2, extraEnergy };
        this.state.phase = PHASE.WAIT_TRAINER_SELECT;
        this._notify(); break;
      }
      case "goods_washi_shrine": {
        if (s.discard.length < 10) {
          s.hand.push(card);
          this._log(`鷲別神社：トラッシュが${s.discard.length}枚のため使用できません（10枚必要）。`);
          this._notify(); break;
        }
        this.state.pendingContext = { type: "washi_shrine_select", card, candidates: [...s.discard], selected: [] };
        this.state.phase = PHASE.WAIT_TRAINER_SELECT;
        this._notify(); break;
      }
      default:
        this.state.player.discard.push(card);
        this._log(`${card.name} を使用した。`);
        this._notify();
    }
  }

  toolAttach(targetUid) {
    if (this.state.phase !== PHASE.WAIT_TRAINER_TARGET) return;
    const ctx = this.state.pendingContext;
    const target = this._findPokemonByUid("player", targetUid);
    if (!target) return this._err("ポケモンが見つかりません");
    const card = ctx.card;
    if (card.effectKey === "tool_kanabo") {
      target.attachedTool = { ...card };
      this.state.pendingContext = { type: "kanabo_color", card, targetUid };
      this.state.phase = PHASE.WAIT_TRAINER_ANSWER;
      this._log(`${target.name} に金棒をつけた。相手の着衣色を申告してください。`);
      this._notify(); return;
    }
    target.attachedTool = { ...card };
    this.state.pendingContext = null;
    this.state.phase = PHASE.PLAYER_TURN;
    this._log(`${target.name} に ${card.name} をつけた！`);
    this._notify();
  }

  nkbSousenkyoSelect(targetUid) {
    if (this.state.phase !== PHASE.WAIT_TRAINER_TARGET) return;
    const s = this.state.player;
    const ctx = this.state.pendingContext;
    const target = this._findPokemonByUid("player", targetUid);
    if (!target || target.name !== "飼育されているクマ") return this._err("飼育されているクマを選んでください");

    // 手札・山札にある「選抜NKB 神7:イナホ」の実カードを候補として集める
    const handInaho = s.hand.filter(c => c.id === "p005");
    const deckInaho = s.deck.filter(c => c.id === "p005");
    const candidates = [
      ...handInaho.map(c => ({ ...c, _source: "hand" })),
      ...deckInaho.map(c => ({ ...c, _source: "deck" })),
    ];

    if (candidates.length === 0) {
      // 進化先が存在しない：進化せず、使用したグッズのみトラッシュ
      if (ctx?.card) s.discard.push(ctx.card);
      this._log("NKB総選挙：手札にも山札にも選抜NKB 神7:イナホがいないため進化できなかった。");
      this.state.pendingContext = null;
      this.state.phase = PHASE.PLAYER_TURN;
      this._notify();
      return;
    }

    this.state.pendingContext = { type: "nkb_inaho_select", card: ctx?.card, targetUid, candidates };
    this.state.phase = PHASE.WAIT_TRAINER_SELECT;
    this._log("NKB総選挙：進化に使う 選抜NKB 神7:イナホ を選んでください。");
    this._notify();
  }

  nkbInahoSelect(cardUid) {
    if (this.state.phase !== PHASE.WAIT_TRAINER_SELECT) return;
    const s = this.state.player;
    const ctx = this.state.pendingContext;
    const chosen = ctx?.candidates?.find(c => c.uid === cardUid);
    if (!chosen) return this._err("そのカードは選択できません");
    const target = this._findPokemonByUid("player", ctx.targetUid);
    if (!target || target.name !== "飼育されているクマ") return this._err("進化元のクマが見つかりません");

    // 選んだ実カードを実際に手札 or 山札から取り除いて消費する
    if (chosen._source === "hand") {
      const hi = s.hand.findIndex(c => c.uid === cardUid);
      if (hi !== -1) s.hand.splice(hi, 1);
    } else {
      const di = s.deck.findIndex(c => c.uid === cardUid);
      if (di !== -1) s.deck.splice(di, 1);
      s.deck = this._shuffle(s.deck);
    }

    const { _source, ...chosenClean } = chosen;
    const evolved = { ...chosenClean, uid: target.uid, attachedEnergy: target.attachedEnergy, damage: target.damage, abilityUsedThisTurn: false, attachedTool: target.attachedTool || null };
    if (s.active && s.active.uid === target.uid) s.active = evolved;
    else { const bi = s.bench.findIndex(c => c.uid === target.uid); if (bi !== -1) s.bench[bi] = evolved; }
    this._log("NKB総選挙：飼育されているクマ が 選抜NKB 神7:イナホ に進化！");
    const boss = [s.active, ...s.bench].find(p => p && p.name === "飼育された群れのボス");
    if (boss) { boss._hpDoubled = true; this._log("飼育された群れのボス のHPが2倍になった！"); }
    if (ctx?.card) s.discard.push(ctx.card);
    this.state.pendingContext = null;
    this.state.phase = PHASE.PLAYER_TURN;
    this._notify();
  }

  kumaBokujyoSelect(uid) {
    if (this.state.phase !== PHASE.WAIT_TRAINER_SELECT) return;
    const s = this.state.player;
    const ctx = this.state.pendingContext;
    const idx = s.deck.findIndex(c => c.uid === uid);
    if (idx === -1) return this._err("山札にそのカードはありません");
    const card = s.deck.splice(idx, 1)[0];
    s.hand.push(card); s.deck = this._shuffle(s.deck);
    if (ctx?.card) s.discard.push(ctx.card);
    this._log(`登別クマ牧場：${card.name} を手札に加えた。山札をシャッフルした。`);
    this.state.pendingContext = null; this.state.phase = PHASE.PLAYER_TURN; this._notify();
  }

  yakitoriTarget(targetUid) {
    if (this.state.phase !== PHASE.WAIT_TRAINER_TARGET) return;
    const s = this.state.player;
    const ctx = this.state.pendingContext;
    const target = this._findPokemonByUid("player", targetUid);
    if (!target) return this._err("ポケモンが見つかりません");
    if (!target.attachedEnergy || target.attachedEnergy.length === 0)
      return this._err("エネルギーがついていないので使えません");
    const removedEnergy = target.attachedEnergy.splice(0, 1)[0];
    s.discard.push(removedEnergy);
    target.damage = Math.max(0, target.damage - 70);
    this._log(`室蘭やきとり：${target.name} のHPを70回復！エネルギー1枚トラッシュ。`);
    this.state.pendingContext = { type: "yakitori_price", card: ctx.card, targetUid };
    this.state.phase = PHASE.WAIT_TRAINER_ANSWER; this._notify();
  }

  yakitoriPriceAnswer(inputPrice, benchTargetUid) {
    if (this.state.phase !== PHASE.WAIT_TRAINER_ANSWER) return;
    const ctx = this.state.pendingContext;
    const correct = parseInt(inputPrice, 10) === 150;
    if (correct && benchTargetUid) {
      const bTarget = this.state.cpu.bench.find(p => p && p.uid === benchTargetUid);
      if (bTarget) { bTarget.damage = Math.max(0, bTarget.damage - 20); this._log(`正解！相手の ${bTarget.name} のHPも20回復した。`); }
    } else if (correct) {
      this._log("正解！（相手ベンチなし）");
    } else {
      this._log("不正解（正解は150円）。追加効果なし。");
    }
    if (ctx?.card) this.state.player.discard.push(ctx.card);
    this.state.pendingContext = null; this.state.phase = PHASE.PLAYER_TURN; this._notify();
  }

  yakisobaTarget(targetUid) {
    if (this.state.phase !== PHASE.WAIT_TRAINER_TARGET) return;
    const ctx = this.state.pendingContext;
    const target = this._findPokemonByUid("player", targetUid);
    if (!target) return this._err("ポケモンが見つかりません");
    target.damage = Math.max(0, target.damage - 50);
    this._log(`登別閻魔焼きそば：${target.name} のHPを50回復！`);
    this.state.pendingContext = { type: "yakisoba_check", card: ctx?.card, targetUid };
    this.state.phase = PHASE.WAIT_TRAINER_ANSWER; this._notify();
  }

  yakisobaAnswer(ate) {
    if (this.state.phase !== PHASE.WAIT_TRAINER_ANSWER) return;
    const ctx = this.state.pendingContext;
    const s = this.state.player;
    if (ate) {
      [s.active, ...s.bench].filter(Boolean).forEach(p => { p.damage = Math.max(0, p.damage - 30); });
      this._log("焼きそば食べた！ベンチポケモン全員のHPも30回復！");
    } else {
      this._log("焼きそばなし。追加回復なし。");
    }
    if (ctx?.card) s.discard.push(ctx.card);
    this.state.pendingContext = null; this.state.phase = PHASE.PLAYER_TURN; this._notify();
  }

  nipponSteelSelectEnergy(uid, side) {
    if (this.state.phase !== PHASE.WAIT_TRAINER_SELECT) return;
    const ctx = this.state.pendingContext;
    const s = this.state[side];
    const idx = s.discard.findIndex(c => c.uid === uid);
    if (idx === -1) return this._err("トラッシュにそのカードはありません");
    const energy = s.discard.splice(idx, 1)[0];
    if (!s.active) { s.discard.push(energy); return this._err("バトル場にポケモンがいません"); }
    s.active.attachedEnergy.push(energy);
    this._log(`日本製鉄：${s.active.name} にエネルギーをつけた！`);
    const cpu = this.state.cpu;
    const cpuEIdx = cpu.discard.findIndex(c => c.cardType === "energy");
    if (cpuEIdx !== -1 && cpu.active) {
      const cpuE = cpu.discard.splice(cpuEIdx, 1)[0];
      cpu.active.attachedEnergy.push(cpuE);
      this._log(`日本製鉄（CPU）：${cpu.active.name} にエネルギーをつけた。`);
    }
    this.state.pendingContext = { type: "nippon_steel_bonus", card: ctx?.card };
    this.state.phase = PHASE.WAIT_TRAINER_ANSWER; this._notify();
  }

  nipponSteelBonusAnswer(has) {
    if (this.state.phase !== PHASE.WAIT_TRAINER_ANSWER) return;
    const ctx = this.state.pendingContext;
    if (has) {
      const s = this.state.player;
      const benches = s.bench.filter(Boolean);
      if (benches.length > 0 && s.discard.some(c => c.cardType === "energy")) {
        this.state.pendingContext = { type: "nippon_steel_bench_energy", card: ctx?.card, candidates: benches };
        this.state.phase = PHASE.WAIT_TRAINER_TARGET; this._notify(); return;
      }
      this._log("追加効果：トラッシュにエネルギーなし / ベンチなし。");
    } else {
      this._log("追加効果なし。");
    }
    if (ctx?.card) this.state.player.discard.push(ctx.card);
    this.state.pendingContext = null; this.state.phase = PHASE.PLAYER_TURN; this._notify();
  }

  nipponSteelBenchEnergyAttach(benchUid, energyUid) {
    const ctx = this.state.pendingContext;
    const s = this.state.player;
    const target = s.bench.find(p => p && p.uid === benchUid);
    const eIdx = s.discard.findIndex(c => c.uid === energyUid);
    if (!target || eIdx === -1) {
      if (ctx?.card) s.discard.push(ctx.card);
      this.state.pendingContext = null; this.state.phase = PHASE.PLAYER_TURN; this._notify(); return;
    }
    const energy = s.discard.splice(eIdx, 1)[0];
    target.attachedEnergy.push(energy);
    this._log(`${target.name} にエネルギーをつけた！`);
    if (ctx?.card) s.discard.push(ctx.card);
    this.state.pendingContext = null; this.state.phase = PHASE.PLAYER_TURN; this._notify();
  }

  hakuchoBridgeSelect(uid) {
    if (this.state.phase !== PHASE.WAIT_TRAINER_SELECT) return;
    const s = this.state.player;
    const ctx = this.state.pendingContext;
    const idx = s.deck.findIndex(c => c.uid === uid);
    if (idx === -1) return this._err("山札にそのカードはありません");
    const card = s.deck.splice(idx, 1)[0];
    s.hand.push(card); s.deck = this._shuffle(s.deck);
    this._log(`白鳥大橋：${card.name} を手札に加えた。`);
    if (ctx && ctx.extraEnergy) {
      const eIdx = s.deck.findIndex(c => c.cardType === "energy");
      if (eIdx !== -1) { const e = s.deck.splice(eIdx, 1)[0]; s.hand.push(e); this._log(`白鳥大橋（追加）：${e.name} も手札に加えた。`); s.deck = this._shuffle(s.deck); }
    }
    if (ctx?.card) s.discard.push(ctx.card);
    this.state.pendingContext = null; this.state.phase = PHASE.PLAYER_TURN; this._notify();
  }

  washiShrineSelect(uid) {
    if (this.state.phase !== PHASE.WAIT_TRAINER_SELECT) return;
    const s = this.state.player;
    const ctx = this.state.pendingContext;
    const card = ctx.candidates.find(c => c.uid === uid);
    if (!card) return this._err("そのカードはトラッシュにありません");
    if (!ctx.selected) ctx.selected = [];
    const alreadyIdx = ctx.selected.findIndex(c => c.uid === uid);
    if (alreadyIdx !== -1) {
      ctx.selected.splice(alreadyIdx, 1);
    } else {
      if (ctx.selected.length >= 3) return this._err("3枚まで選べます");
      ctx.selected.push(card);
    }
    if (ctx.selected.length === 3) {
      ctx.selected.forEach(c => {
        const di = s.discard.findIndex(x => x.uid === c.uid);
        if (di !== -1) s.deck.push(s.discard.splice(di, 1)[0]);
      });
      s.deck = this._shuffle(s.deck);
      for (let i = 0; i < 2 && s.deck.length; i++) s.hand.push(s.deck.shift());
      if (ctx.card) s.discard.push(ctx.card);
      this._log("鷲別神社：3枚を山札に戻し、2枚ドロー！");
      this.state.pendingContext = null; this.state.phase = PHASE.PLAYER_TURN;
    }
    this._notify();
  }

  hanabiAnswer(went) {
    if (this.state.phase !== PHASE.WAIT_TRAINER_ANSWER) return;
    const s = this.state.player;
    const ctx = this.state.pendingContext;
    const count = went ? 4 : 3;
    let added = 0;
    for (let i = 0; added < count && s.deck.length; ) {
      const idx = s.deck.findIndex(c => c.cardType === "energy");
      if (idx === -1) break;
      s.hand.push(s.deck.splice(idx, 1)[0]); added++;
    }
    s.deck = this._shuffle(s.deck);
    if (ctx?.card) s.discard.push(ctx.card);
    this._log(`室蘭満点花火：エネルギーを${added}枚手札に加えた！${went ? "（花火ボーナス+1）" : ""}`);
    this.state.pendingContext = null; this.state.phase = PHASE.PLAYER_TURN; this._notify();
  }

  yasudaPeekDone() {
    const ctx = this.state.pendingContext;
    if (ctx?.card) this.state.player.discard.push(ctx.card);
    this.state.pendingContext = null; this.state.phase = PHASE.PLAYER_TURN; this._notify();
  }

  bossOrderSelect(benchUid) {
    if (this.state.phase !== PHASE.WAIT_TRAINER_BENCH_SELECT) return;
    const ctx = this.state.pendingContext;
    const cpu = this.state.cpu;
    const bi = cpu.bench.findIndex(p => p && p.uid === benchUid);
    if (bi === -1) return this._err("ベンチのポケモンを選んでください");
    const newActive = cpu.bench.splice(bi, 1)[0];
    if (cpu.active) cpu.bench.push(cpu.active);
    cpu.active = newActive;
    if (ctx?.card) this.state.player.discard.push(ctx.card);
    this._log(`ボスの指令：${newActive.name} をバトル場に引きずり出した！`);
    this.state.pendingContext = null; this.state.phase = PHASE.PLAYER_TURN; this._notify();
  }

  kanaboColorAnswer(color) {
    if (this.state.phase !== PHASE.WAIT_TRAINER_ANSWER) return;
    const ctx = this.state.pendingContext;
    const target = this._findPokemonByUid("player", ctx.targetUid);
    let bonus = 0;
    if (color === "red") bonus = 20;
    else if (color === "blue") bonus = 30;
    // color === "none"（赤でも青でもない）の場合は bonus = 0（基本の+20のみ適用）
    if (target) target.kanaboColorBonus = bonus;
    const colorLabel = color === "red" ? "赤" : color === "blue" ? "青" : "なし";
    this._log(`金棒装備完了。着衣色：${colorLabel}（追加ダメージ+${bonus}）`);
    this.state.pendingContext = null; this.state.phase = PHASE.PLAYER_TURN; this._notify();
  }

  // ----------------------------------------------------------
  // レコレクション追加ワザ
  // ----------------------------------------------------------
  // ----------------------------------------------------------
  // レコレクション追加ワザ（ベンチ進化：1匹ずつプレイヤーが選択）
  // ----------------------------------------------------------
  useRecollection(attackerUid) {
    if (this.state.phase !== PHASE.PLAYER_TURN) return this._err("あなたのターンではありません");
    if (this.state.turnFlags.attacked) return this._err("すでにワザを使いました");
    const attacker = this._findPokemonByUid("player", attackerUid);
    if (!attacker || !attacker.attachedTool || attacker.attachedTool.effectKey !== "tool_recollection")
      return this._err("ワザマシン レコレクションを持っていません");
    const s = this.state.player;
    // 進化先が山札に存在するベンチポケモンのみ候補にする
    const bench = s.bench.filter(Boolean).filter(p =>
      s.deck.some(c => c.evolvesFrom === p.name)
    );
    if (bench.length === 0) {
      this._log("レコレクション：進化できるベンチポケモンがいません（山札に進化先なし）。");
      this.state.turnFlags.attacked = true;
      this._afterAttack();
      return;
    }
    this.state.pendingContext = {
      type: "recollection_bench_select",
      attackerUid,
      candidates: bench,
      evolvedCount: 0,
    };
    this.state.phase = PHASE.WAIT_RECOLLECTION_BENCH;
    this._log("レコレクション：進化させるベンチポケモンを選んでください（最大2匹）。");
    this._notify();
  }

  // ベンチポケモンを1匹選択 → その進化先候補（山札）を選ぶフェーズへ
  recollectionSelectBench(benchUid) {
    if (this.state.phase !== PHASE.WAIT_RECOLLECTION_BENCH) return;
    const ctx = this.state.pendingContext;
    const s = this.state.player;
    const target = ctx.candidates.find(p => p.uid === benchUid);
    if (!target) return this._err("そのポケモンは選択できません");
    const evoCandidates = s.deck.filter(c => c.evolvesFrom === target.name);
    if (evoCandidates.length === 0) return this._err("山札に進化先がありません");
    this.state.pendingContext = {
      type: "recollection_evolve_select",
      attackerUid: ctx.attackerUid,
      benchUid: target.uid,
      benchName: target.name,
      evoCandidates,
      evolvedCount: ctx.evolvedCount,
      remainingBenchCandidates: ctx.candidates.filter(p => p.uid !== benchUid),
    };
    this.state.phase = PHASE.WAIT_RECOLLECTION_EVOLVE;
    this._log(`${target.name}：進化先を山札から選んでください。`);
    this._notify();
  }

  // 進化先カードを選択して進化実行
  recollectionSelectEvolution(evoCardUid) {
    if (this.state.phase !== PHASE.WAIT_RECOLLECTION_EVOLVE) return;
    const ctx = this.state.pendingContext;
    const s = this.state.player;
    const evoCard = ctx.evoCandidates.find(c => c.uid === evoCardUid);
    if (!evoCard) return this._err("そのカードは選択できません");
    const target = [s.active, ...s.bench].find(p => p && p.uid === ctx.benchUid);
    if (!target) return this._err("対象のポケモンが見つかりません");

    const deckIdx = s.deck.findIndex(c => c.uid === evoCard.uid);
    if (deckIdx !== -1) s.deck.splice(deckIdx, 1);
    const evolvedPoke = { ...evoCard, uid: target.uid, attachedEnergy: target.attachedEnergy, damage: target.damage, abilityUsedThisTurn: false, attachedTool: target.attachedTool || null };
    const bi = s.bench.findIndex(c => c.uid === target.uid);
    if (bi !== -1) s.bench[bi] = evolvedPoke;
    s.deck = this._shuffle(s.deck);
    this._log(`レコレクション：${target.name} が ${evoCard.name} に進化！`);

    const evolvedCount = ctx.evolvedCount + 1;
    const remaining = ctx.remainingBenchCandidates.filter(p =>
      s.deck.some(c => c.evolvesFrom === p.name)
    );

    if (evolvedCount >= 2 || remaining.length === 0) {
      this._finishRecollection();
      return;
    }

    // まだ1匹目のみ進化済み → もう1匹選ぶか終了するかの選択へ
    this.state.pendingContext = {
      type: "recollection_bench_select",
      attackerUid: ctx.attackerUid,
      candidates: remaining,
      evolvedCount,
    };
    this.state.phase = PHASE.WAIT_RECOLLECTION_BENCH;
    this._notify();
  }

  // 「これ以上進化させない」を選んで終了
  recollectionFinish() {
    if (this.state.phase !== PHASE.WAIT_RECOLLECTION_BENCH) return;
    this._finishRecollection();
  }

  _finishRecollection() {
    this.state.pendingContext = null;
    this.state.turnFlags.attacked = true;
    this.state.phase = PHASE.PLAYER_TURN;
    this._afterAttack();
  }

  _afterAttack() {
    this.endTurn();
  }

  endTurn() {
    if (this.state.phase !== PHASE.PLAYER_TURN) return;
    // ターン終了時にポケモンの道具（レコレクション）をトラッシュ
    this._discardTurnEndTools("player");
    // justPlacedThisTurnフラグリセット
    const s = this.state;
    [s.player.active, ...s.player.bench].filter(Boolean)
      .forEach(p => { p.justPlacedThisTurn = false; });
    this._log("ターン終了。");
    this.state.phase = PHASE.CPU_TURN;
    this._notify();
    setTimeout(() => this._cpuTurn(), 900);
  }

  // ターン終了時にdiscardAtTurnEnd道具をトラッシュ
  _discardTurnEndTools(side) {
    const s = this.state[side];
    const allPoke = [s.active, ...s.bench].filter(Boolean);
    allPoke.forEach(p => {
      if (p.attachedTool && p.attachedTool.discardAtTurnEnd) {
        this._log(`${p.name} の ${p.attachedTool.name} をトラッシュした。`);
        s.discard.push(p.attachedTool);
        p.attachedTool = null;
      }
    });
  }

  // ----------------------------------------------------------
  // ダメージ計算
  // ----------------------------------------------------------
  _calcDamage(move, attacker, defender, attackerSide, moveIndex) {
    let dmg = move.damage;
    const effect = move.effect;

    if (effect === "sousenkyo") {
      // 場+トラッシュのクマ系枚数×20追加
      const s         = this.state[attackerSide];
      const fieldCount = [s.active, ...s.bench]
        .filter(p => p && KUMA_LINE_IDS.has(p.id)).length;
      const trashCount = s.discard.filter(c => KUMA_LINE_IDS.has(c.id)).length;
      dmg += (fieldCount + trashCount) * 20;
      this._log(`総選挙：クマ系 ${fieldCount + trashCount} 枚 → +${(fieldCount + trashCount) * 20}ダメージ`);
    }

    if (effect === "kamikudaku") {
      dmg += attacker.damage;
      this._log(`かみくだく：被ダメージ ${attacker.damage} 追加 → 合計 ${dmg}`);
    }

    if (effect === "one_hand_strike") {
      const myEnergy  = (attacker.attachedEnergy || []).length;
      const oppEnergy = (defender.attachedEnergy || []).length;
      dmg += (myEnergy + oppEnergy) * 30;
      this._log(`ワン・ハンド・ストライク：エネルギー合計 ${myEnergy + oppEnergy} 個 → +${(myEnergy + oppEnergy) * 30}ダメージ`);
    }

    if (effect === "minkan_kousei") {
      // コスト軽減はすでに適用済み（ダメージには影響なし）
    }

    // 金棒：baseDamageBonus +20、colorBonus は別途 colorBonus フラグを参照
    if (attacker.attachedTool && attacker.attachedTool.effectKey === "tool_kanabo") {
      const tool = attacker.attachedTool;
      dmg += tool.tool_effect.baseDamageBonus;
      const cb = attacker.kanaboColorBonus || 0;
      dmg += cb;
      if (tool.tool_effect.baseDamageBonus > 0 || cb > 0)
        this._log(`金棒：+${tool.tool_effect.baseDamageBonus + cb}ダメージ（色ボーナス+${cb}）`);
    }

    return dmg;
  }

  // ダメージ適用（被ダメ軽減特性を考慮）
  _applyDamage(defender, rawDmg, defenderSide) {
    let dmg = rawDmg;

    // 「選抜の7頭」：場の全エネルギー合計×20軽減
    const defSide = this.state[defenderSide];
    const inahoOnField = [defSide.active, ...defSide.bench]
      .some(p => p && p.ability && p.ability.effectKey === "sentaku_no_7");
    if (inahoOnField) {
      const totalEnergy = [defSide.active, ...defSide.bench]
        .filter(Boolean)
        .reduce((sum, p) => sum + p.attachedEnergy.length, 0);
      const reduction = totalEnergy * 20;
      dmg = Math.max(0, dmg - reduction);
      if (reduction > 0) this._log(`選抜の7頭：エネルギー ${totalEnergy} 枚 → ${reduction} ダメージ軽減！`);
    }

    // 「王の風格」：相手がたねの場合ダメージ0（HP条件付き）
    if (defender.ability && defender.ability.effectKey === "ou_no_fukaku") {
      const attackerSide  = defenderSide === "player" ? "cpu" : "player";
      const attacker      = this.state[attackerSide].active;
      if (attacker && attacker.stage === 0) {
        const attackerMaxHp = GameEngine.maxHp(attacker);
        const defenderMaxHp = GameEngine.maxHp(defender);
        if (attackerMaxHp <= defenderMaxHp) {
          dmg = 0;
          this._log(`王の風格：たねポケモンからのダメージを0にした！`);
        } else {
          this._log(`王の風格：相手たねのHPが高いため無効！`);
        }
      }
    }

    defender.damage += dmg;
  }

  // ワザコスト軽減（浄玻璃の鏡・民間から公式へ）
  _getEffectiveCost(pokemon, move, side) {
    let cost = [...move.cost];

    // 浄玻璃の鏡：手札差分だけコスト軽減
    if (pokemon.ability && pokemon.ability.effectKey === "jyouhari_kagami") {
      const myHand  = this.state[side].hand.length;
      const oppSide = side === "player" ? "cpu" : "player";
      const oppHand = this.state[oppSide].hand.length;
      const diff    = Math.max(0, oppHand - myHand);
      if (diff > 0) {
        cost = cost.slice(diff);
        this._log(`浄玻璃の鏡：手札差 ${diff} 枚 → コスト ${diff} 個軽減`);
      }
    }

    // 民間から公式へ：このターン特性2回以上使用でコスト1減
    if (move.effect === "minkan_kousei" && this.state.turnFlags.abilityUseCount >= 2) {
      cost = cost.slice(1);
      this._log(`民間から公式へ：特性2回使用済みのためコスト1軽減`);
    }

    return cost;
  }

  _canUseMove(pokemon, effectiveCost) {
    const energyMap = {};
    for (const e of pokemon.attachedEnergy) {
      energyMap[e.type] = (energyMap[e.type] || 0) + 1;
    }
    const total    = pokemon.attachedEnergy.length;
    const needed   = {};
    let colorless  = 0;
    for (const c of effectiveCost) {
      if (c === CARD_TYPES.COLORLESS) colorless++;
      else needed[c] = (needed[c] || 0) + 1;
    }
    for (const [type, count] of Object.entries(needed)) {
      if ((energyMap[type] || 0) < count) return false;
    }
    const usedColored = Object.values(needed).reduce((a, b) => a + b, 0);
    return (total - usedColored) >= colorless;
  }

  // ----------------------------------------------------------
  // CPUターン
  // ----------------------------------------------------------
  _cpuTurn() {
    const s = this.state;
    if (s.phase !== PHASE.CPU_TURN) return;
    this._log("── CPUのターン ──");

    // 1. ドロー
    if (s.cpu.deck.length === 0) {
      this._log("CPUのデッキが切れた！あなたの勝ち！");
      this._endGame("player"); this._notify(); return;
    }
    s.cpu.hand.push(s.cpu.deck.shift());

    // 2. ベンチにたねを出す
    s.cpu.hand.filter(c => c.cardType !== "energy" && c.stage === 0).forEach(card => {
      if (s.cpu.bench.length < 4) {
        s.cpu.bench.push(this._makeBattleCopy(card));
        s.cpu.hand = s.cpu.hand.filter(c => c.uid !== card.uid);
        this._log(`CPU: ${card.name} をベンチに出した。`);
      }
    });

    // 3. エネルギーをつける（バトル場優先）
    const cpuEnergy = s.cpu.hand.find(c => c.cardType === "energy");
    if (cpuEnergy) {
      const target = s.cpu.active || s.cpu.bench[0];
      if (target) {
        target.attachedEnergy.push({ ...cpuEnergy });
        s.cpu.hand = s.cpu.hand.filter(c => c.uid !== cpuEnergy.uid);
        this._log(`CPU: ${target.name} にエネルギーをつけた。`);
      }
    }

    // 4. 進化
    if (s.turn > 1) {
      const evoCandidates = s.cpu.hand.filter(c => c.stage > 0);
      for (const evo of evoCandidates) {
        const target = this._findEvolveTarget("cpu", evo);
        if (target) {
          const evolved = { ...evo, uid: target.uid, attachedEnergy: target.attachedEnergy, damage: target.damage, abilityUsedThisTurn: false };
          if (s.cpu.active && s.cpu.active.uid === target.uid) s.cpu.active = evolved;
          else {
            const bi = s.cpu.bench.findIndex(c => c.uid === target.uid);
            if (bi !== -1) s.cpu.bench[bi] = evolved;
          }
          s.cpu.hand = s.cpu.hand.filter(c => c.uid !== evo.uid);
          this._log(`CPU: ${target.name} が ${evo.name} に進化した。`);
          break;
        }
      }
    }

    // 5. ワザ
    const attacker = s.cpu.active;
    const defender = s.player.active;
    if (attacker && defender) {
      const usableMoves = attacker.moves
        .map((m, i) => ({ m, i, cost: this._getEffectiveCost(attacker, m, "cpu") }))
        .filter(({ m, cost }) => this._canUseMove(attacker, cost) && m.effect !== "fansa");
      if (usableMoves.length > 0) {
        const { m: best, i: bestIdx } = usableMoves.reduce((a, b) => b.m.damage > a.m.damage ? b : a);
        let dmg = this._calcDamage(best, attacker, defender, "cpu", bestIdx);

        if (best.effect === "jigoku_welcome") {
          this._applyDamage(defender, dmg, "player");
          this._log(`CPU の ${attacker.name} の 地獄へWelcome！ ${defender.name} に ${dmg} ダメージ！`);
          this._checkKO("player");
          if (s.phase === PHASE.GAME_OVER) { this._notify(); return; }
          // CPUは自動でベンチをランダム選択
          if (s.player.bench.length > 0) {
            const ri     = Math.floor(Math.random() * s.player.bench.length);
            const bTarget = s.player.bench[ri];
            this._applyDamage(bTarget, 20, "player");
            this._log(`CPU: ${bTarget.name} に20ダメージ！`);
            this._checkKO("player");
          }
        } else if (best.effect === "enma_cho") {
          this._applyDamage(defender, dmg, "player");
          this._log(`CPU の ${attacker.name} の 閻魔帳！ ${defender.name} に ${dmg} ダメージ！`);
          // プレイヤー手札を半分トラッシュ
          const h     = s.player.hand;
          const trash = Math.floor(h.length / 2);
          for (let i = 0; i < trash; i++) {
            const ri = Math.floor(Math.random() * h.length);
            s.player.discard.push(h.splice(ri, 1)[0]);
          }
          this._log(`閻魔帳の効果：あなたの手札を ${trash} 枚トラッシュした！`);
          this._checkKO("player");
        } else {
          this._applyDamage(defender, dmg, "player");
          this._log(`CPU の ${attacker.name} の ${best.name}！ ${defender.name} に ${dmg} ダメージ！`);
          this._checkKO("player");
        }
        if (s.phase === PHASE.GAME_OVER) { this._notify(); return; }
      } else {
        this._log(`CPU: ${attacker.name} はワザを使えない（エネルギー不足）。`);
      }
    }

    // 6. ターン終了
    s.phase = PHASE.WAIT_DRAW;
    s.turn++;
    this.state.turnFlags = {
      drawn: false, attachedEnergy: false, attacked: false, retreated: false, abilityUseCount: 0, supportUsed: false
    };
    [s.player.active, ...s.player.bench, s.cpu.active, ...s.cpu.bench]
      .filter(Boolean).forEach(p => { p.abilityUsedThisTurn = false; p.justPlacedThisTurn = false; });
    this._log(`── あなたのターン（${s.turn}ターン目）──`);
    this._notify();
  }

  // ----------------------------------------------------------
  // 気絶チェック
  // ----------------------------------------------------------
  _checkKO(side) {
    const s    = this.state[side];
    const opp  = side === "player" ? this.state.cpu : this.state.player;
    const active = s.active;
    if (!active) return;
    if (active.damage < GameEngine.maxHp(active)) return;

    this._log(`${active.name} は気絶した！`);
    // 付随していたエネルギー・道具もトラッシュへ
    if (active.attachedEnergy && active.attachedEnergy.length > 0) {
      s.discard.push(...active.attachedEnergy);
    }
    if (active.attachedTool) {
      s.discard.push(active.attachedTool);
    }
    s.discard.push({ ...active, attachedEnergy: undefined, attachedTool: undefined });
    s.active = null;

    // サイド取得（eXは2枚）
    const prizesToTake = active.isEX ? 2 : 1;
    for (let i = 0; i < prizesToTake && opp.prizes.length > 0; i++) {
      opp.hand.push(opp.prizes.shift());
      opp.prizesTaken++;
    }
    this._log(`サイドカードを ${prizesToTake} 枚取得！（残り: ${opp.prizes.length}枚）`);

    if (opp.prizesTaken >= 6) { this._endGame(side === "player" ? "cpu" : "player"); return; }
    this._sendNextActive(side);
  }

  _sendNextActive(side) {
    const s = this.state[side];
    if (s.bench.length > 0) {
      s.bench.sort((a, b) => (GameEngine.maxHp(b) - b.damage) - (GameEngine.maxHp(a) - a.damage));
      s.active = s.bench.shift();
      this._log(`${s.active.name} がバトル場に出た！`);
    } else {
      this._log(`${side === "player" ? "あなた" : "CPU"} のベンチが空になった！`);
      this._endGame(side === "player" ? "cpu" : "player");
    }
  }

  // ----------------------------------------------------------
  // 山札からポケモンサーチ（温泉街への集客）
  // ----------------------------------------------------------
  searchPokemonFromDeck(cardUid) {
    if (this.state.phase !== PHASE.WAIT_ONSEN_SEARCH) return;
    const s   = this.state.player;
    const ctx = this.state.pendingContext;
    if (ctx && ctx.candidates && !ctx.candidates.some(c => c.uid === cardUid))
      return this._err("選択できるのは山札のポケモンのみです");
    const idx = s.deck.findIndex(c => c.uid === cardUid);
    if (idx === -1) return this._err("山札にそのカードはありません");
    const card = s.deck[idx];
    if (card.cardType !== "pokemon" || !card.id || !card.id.startsWith("p"))
      return this._err("選択できるのはポケモンカードのみです");
    s.deck.splice(idx, 1);
    s.hand.push(card);
    s.deck = this._shuffle(s.deck);
    this._log(`${card.name} を手札に加えた。山札をシャッフルした。`);
    this.state.pendingContext = null;
    // 選択後はCPUターンへ
    this.state.phase = PHASE.CPU_TURN;
    this._notify();
    setTimeout(() => this._cpuTurn(), 900);
  }

  // 温泉街への集客：ワザ使用後にサーチモードへ
  startOnsenSearch() {
    this._log(`温泉街への集客：山札からポケモンを1枚選んでください。`);
    const pokemons = this.state.player.deck.filter(c => c.cardType === "pokemon" && c.id && c.id.startsWith("p"));
    this.state.pendingContext = { type: "onsen_search", candidates: pokemons };
    this.state.phase = PHASE.WAIT_ONSEN_SEARCH;
    this._notify();
  }

  // ----------------------------------------------------------
  // ユーティリティ
  // ----------------------------------------------------------
  _findPokemonByUid(side, uid) {
    const s = this.state[side];
    if (s.active && s.active.uid === uid) return s.active;
    return s.bench.find(c => c.uid === uid) || null;
  }

  _findEvolveTarget(side, evoCard) {
    const s   = this.state[side];
    const all = [s.active, ...s.bench].filter(Boolean);
    return all.find(p => p.name === evoCard.evolvesFrom) || null;
  }

  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  _endGame(winner) {
    this.state.phase  = PHASE.GAME_OVER;
    this.state.winner = winner;
    this._log(winner === "player" ? "  あなたの勝ちです！" : "  CPUの勝ちです…");
  }

  _log(msg) {
    this.state.log.unshift(msg);
    if (this.state.log.length > 80) this.state.log.pop();
  }

  _err(msg) {
    this._log(`?? ${msg}`);
    this._notify();
    return false;
  }

  _notify() {
    this.onStateChange(this.state);
  }

  static currentHp(pokemon) {
    return Math.max(0, GameEngine.maxHp(pokemon) - pokemon.damage);
  }

  static maxHp(pokemon) {
    const base = POKEMON_CARDS.find(c => c.id === pokemon.id)?.hp || pokemon.hp;
    return pokemon._hpDoubled ? base * 2 : base;
  }
}
