const TITLE = 'Eye Candy Evolution';
// ── 目が離せない映像を育てる（IEC Studio 用・アニメーションモデル）──────
// 粒子が流れ、漂い、群れ、拍（ビート）に合わせて弾ける。
// 一番「目が離せない」と思うものを選び続けると、自分がハマる映像の正体が見えてくる。
//
// ■ 光過敏への配慮（安全のため、改造するときもここは外さないこと）
//   - 拍（明るさ・大きさが変わるタイミング）は「実時間」で刻む。アニメ速度スライダーを上げても速くならない
//   - 拍の周期は MIN_BEAT 秒以上 = 1秒に3回未満
//   - 背景は暗い色で固定し、画面全体は点滅させない。粒の明るさの揺れも小さく抑える
//   完全な安全を保証するものではない。発表前に「点滅が苦手な人は見ないで」と一言添える。

const ANIMATED = true;  // アニメーションモード（initState / stepState / drawFrame を使う）
const MIN_BEAT = 0.35;  // 秒。1/0.35 ≈ 2.9 回/秒 < 3 回/秒

const DESCRIPTION = {
  summary: '粒子の色・動き・リズム・対称性を進化させ、「目が離せない映像」を育てる。',
  gene: '20個の数。色（色相・幅・変化速度・彩度）、粒（数・大きさ・形）、動き（速さ・回転・引き寄せ・群れの移動・ふらつき・流れ・風）、拍（周期・弾け方・脈動）、残像、対称の数。',
  phenotype: '暗い背景の上で動き続ける粒子のアニメーション。画面の端から出た粒は反対側から戻ってくる。',
  selection: '9個の中で一番目が離せないものを選ぶ。考えずに、目が勝手に行くものを選ぶのがコツ。',
};

// 遺伝子の番号（読みやすさのため名前を付ける）
const G = { HUE: 0, HUE_SPREAD: 1, HUE_DRIFT: 2, SAT: 3, COUNT: 4, SPEED: 5, SPIN: 6,
  PULL: 7, BEAT: 8, BURST: 9, PULSE: 10, SIZE: 11, SHAPE: 12, TRAIL: 13, SYM: 14,
  MOVE: 15, DART: 16, FLOW: 17, WIND: 18, WIND_DIR: 19 };

const GENE_RANGES = [
  [0, 360],        // HUE        基本の色相
  [0, 180],        // HUE_SPREAD 粒ごとの色のばらつき
  [0, 0.15],       // HUE_DRIFT  色相がゆっくり回る速さ（周/秒, 実時間）
  [30, 100],       // SAT        彩度
  [5, 80],         // COUNT      粒の数
  [0, 1.5],        // SPEED      ゆらぎの強さ
  [-3, 3],         // SPIN       中心まわりの回転（rad/秒）
  [-1, 1],         // PULL       群れの中心への引き寄せ（負だと散らばる）
  [MIN_BEAT, 2.0], // BEAT       拍の周期（秒, 実時間）
  [0, 1],          // BURST      拍ごとに外へ弾ける強さ
  [0, 1],          // PULSE      拍ごとに粒が膨らむ強さ
  [0.01, 0.06],    // SIZE       粒の大きさ（セル幅比）
  [0, 1],          // SHAPE      形 0〜:丸 0.25〜:四角 0.5〜:三角 0.75〜:線（動く向きに伸びる）
  [0, 0.9],        // TRAIL      残像の長さ
  [1, 8],          // SYM        回転対称の数（1 で対称なし）
  [0, 0.35],       // MOVE       群れの中心が画面を動き回る大きさ
  [0, 1],          // DART       急に向きを変えてふらふら飛ぶ強さ
  [0, 1],          // FLOW       見えない川の流れに乗る強さ
  [0, 1.5],        // WIND       一方向に吹き流される強さ
  [0, 360],        // WIND_DIR   風の向き（度）
];

const PARAM_DEFS = [
  { id: 'mutRate', label: '変異率', min: 0, max: 1, step: 0.01, default: 0.3 },
  { id: 'mutScale', label: '変異の大きさ', min: 0.2, max: 3, step: 0.1, default: 1.3 },
];

// 初期個体の「動きのタイプ」。完全ランダムだと似た動きばかりになるので、タイプごとに遺伝子の範囲を絞る。
// 書いていない遺伝子は QUIET の範囲（ほぼ効かない）か、それにもなければ全範囲からランダム
const QUIET = { SYM: [1, 1.4], BURST: [0, 0.05], MOVE: [0, 0.03], DART: [0, 0.05], FLOW: [0, 0.05], WIND: [0, 0.05] };
const ARCHETYPES = [
  { name: '鼓動',     genes: { SYM: [1, 8], BURST: [0.4, 1], PULL: [0.2, 1] } },  // 縮んで弾ける（円っぽいのはこれだけ）
  { name: '渦',       genes: { SPIN: [-3, 3], PULL: [-0.1, 0.1], SPEED: [0, 0.2], TRAIL: [0.7, 0.9], SYM: [1, 4] } },
  { name: '流れ',     genes: { FLOW: [0.6, 1], SPIN: [0, 0], PULL: [0, 0], SPEED: [0, 0.2], SHAPE: [0.75, 1], COUNT: [40, 80], TRAIL: [0.6, 0.9] } },
  { name: '風',       genes: { WIND: [0.5, 1.5], SPIN: [0, 0], PULL: [0, 0], SPEED: [0.1, 0.5], SHAPE: [0.75, 1], COUNT: [30, 80], SIZE: [0.01, 0.03] } },
  { name: '群れ移動', genes: { MOVE: [0.2, 0.35], PULL: [0.5, 1], SPIN: [-0.5, 0.5], SPEED: [0.2, 0.6], TRAIL: [0.5, 0.9] } },
  { name: 'ふらふら', genes: { DART: [0.6, 1], SPIN: [0, 0], PULL: [-0.05, 0.05], SPEED: [0, 0.2], COUNT: [5, 40], TRAIL: [0.3, 0.8] } },
  { name: '漂う塵',   genes: { SPEED: [1, 1.5], SPIN: [-0.3, 0.3], PULL: [-0.1, 0.1], COUNT: [50, 80], SIZE: [0.01, 0.025], TRAIL: [0.3, 0.6] } },
  { name: '呼吸',     genes: { BEAT: [1.4, 2], PULSE: [0.7, 1], PULL: [-0.2, 0.2], SPEED: [0, 0.3], COUNT: [5, 20], SIZE: [0.03, 0.06], SHAPE: [0, 0.75] } },
];

function createInitialGenome() {
  const a = ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)];
  return GENE_RANGES.map(([mn, mx], i) => {
    const name = Object.keys(G).find(k => G[k] === i);
    const [lo, hi] = a.genes[name] || QUIET[name] || [mn, mx];
    return lo + Math.random() * (hi - lo);
  });
}

function mutateGenome(genome, params = {}) {
  const rate = params.mutRate ?? 0.3;
  const scale = params.mutScale ?? 1.3;
  return genome.map((g, i) => {
    if (Math.random() >= rate) return g;
    const [mn, mx] = GENE_RANGES[i];
    const delta = (mx - mn) * (Math.random() * 0.2 - 0.1) * scale;
    return Math.min(mx, Math.max(mn, g + delta));
  });
}

// 拍の位相（0〜1）。実時間で刻むので速度スライダーの影響を受けない
function beatPhase(genome) {
  const period = Math.max(MIN_BEAT, genome[G.BEAT]);
  return (Date.now() / 1000 / period) % 1;
}

// 群れの中心。MOVE が大きいほど画面を大きく動き回る（8の字に近い軌道）
function center(state, genome) {
  const m = genome[G.MOVE], t = state.t;
  return [m * Math.sin(t * 0.7), m * Math.sin(t * 1.1 + 1)];
}

function initState(genome, W, H) {
  const n = Math.round(genome[G.COUNT]);
  // 画面全体（四角）にばらまく
  const parts = Array.from({ length: n }, (_, i) => ({ x: Math.random() - 0.5, y: Math.random() - 0.5, vx: 0, vy: 0, k: i / n }));
  return { parts, t: 0, lastPhase: beatPhase(genome), first: true };
}

function stepState(state, dt, genome, W, H) {
  state.t += dt;
  const ph = beatPhase(genome);
  const onBeat = ph < state.lastPhase;  // 位相が 1→0 に戻った瞬間 = 拍
  state.lastPhase = ph;
  const speed = genome[G.SPEED], spin = genome[G.SPIN], pull = genome[G.PULL], burst = genome[G.BURST];
  const dart = genome[G.DART], flow = genome[G.FLOW], wind = genome[G.WIND];
  const wd = genome[G.WIND_DIR] * Math.PI / 180, wx = Math.cos(wd) * wind, wy = Math.sin(wd) * wind;
  const [cx, cy] = center(state, genome);
  for (const p of state.parts) {
    const dx = p.x - cx, dy = p.y - cy, r = Math.hypot(dx, dy) || 1e-6;
    if (onBeat) { p.vx += (dx / r) * burst * 1.2; p.vy += (dy / r) * burst * 1.2; }
    // ふらふら：ときどき急にランダムな向きへ飛ぶ
    if (Math.random() < dart * dt * 2.5) { const a = Math.random() * Math.PI * 2; p.vx = Math.cos(a) * dart * 1.5; p.vy = Math.sin(a) * dart * 1.5; }
    // 流れ：場所ごとに向きが決まった見えない川（時間でゆっくり形が変わる）
    const fa = (Math.sin(p.x * 7 + state.t * 0.3) + Math.cos(p.y * 6 - state.t * 0.2)) * Math.PI;
    p.vx += (Math.cos(fa) * flow * 1.5 + wx * 1.2 - dy * spin - dx * pull * 2 + (Math.random() - 0.5) * speed * 2) * dt;
    p.vy += (Math.sin(fa) * flow * 1.5 + wy * 1.2 + dx * spin - dy * pull * 2 + (Math.random() - 0.5) * speed * 2) * dt;
    p.vx *= Math.pow(0.3, dt); p.vy *= Math.pow(0.3, dt);  // 減衰
    p.x += p.vx * dt; p.y += p.vy * dt;
    // 四角い画面の端から出たら反対側へ（円い縁を作らない）
    if (p.x > 0.5) p.x -= 1; else if (p.x < -0.5) p.x += 1;
    if (p.y > 0.5) p.y -= 1; else if (p.y < -0.5) p.y += 1;
  }
}

function drawFrame(ctx, state, genome, W, H) {
  // 背景は暗い色で固定。残像は半透明で塗り重ねて作る（画面全体の明るさは変えない）
  ctx.fillStyle = state.first ? '#0b0b12' : 'rgba(11,11,18,' + (1 - genome[G.TRAIL]).toFixed(3) + ')';
  ctx.fillRect(0, 0, W, H);
  state.first = false;

  const ph = beatPhase(genome);
  const env = Math.exp(-ph * 5);  // 拍の直後に強く、すぐ減衰
  const t = Date.now() / 1000;
  const hue0 = genome[G.HUE] + t * genome[G.HUE_DRIFT] * 360;
  const sat = genome[G.SAT];
  const light = 55 + 8 * env;     // 明るさの揺れは ±8% 程度に抑える
  const size = genome[G.SIZE] * W * (1 + genome[G.PULSE] * env);
  const sym = Math.round(genome[G.SYM]);
  const shape = genome[G.SHAPE];

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.lineCap = 'round';
  for (const p of state.parts) {
    const col = 'hsl(' + ((hue0 + p.k * genome[G.HUE_SPREAD]) % 360).toFixed(1) + ',' + sat.toFixed(0) + '%,' + light.toFixed(0) + '%)';
    ctx.fillStyle = col; ctx.strokeStyle = col;
    for (let s = 0; s < sym; s++) {
      const a = (s / sym) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const x = (p.x * c - p.y * sn) * W, y = (p.x * sn + p.y * c) * H;
      ctx.beginPath();
      if (shape < 0.25) ctx.arc(x, y, size, 0, Math.PI * 2);
      else if (shape < 0.5) ctx.rect(x - size, y - size, size * 2, size * 2);
      else if (shape < 0.75) { ctx.moveTo(x, y - size * 1.2); ctx.lineTo(x + size, y + size * 0.8); ctx.lineTo(x - size, y + size * 0.8); ctx.closePath(); }
      else {
        // 線：動いている向きに尾を引く
        const vx = (p.vx * c - p.vy * sn) * W * 0.12, vy = (p.vx * sn + p.vy * c) * H * 0.12;
        ctx.lineWidth = Math.max(1, size * 0.6);
        ctx.moveTo(x, y); ctx.lineTo(x - vx - 0.001, y - vy); ctx.stroke();
        continue;
      }
      ctx.fill();
    }
  }
  ctx.restore();
}
