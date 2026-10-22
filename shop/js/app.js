/* ============================================================
   雪峰优选 · 演示购物站
   商品/订单/地址数据由 server.py 接口提供，图片在 assets/products/ 下
   ============================================================ */

/* ---------- 确定性伪随机：以商品 ID 等作种子，保证详情卖点/评价等内容刷新后不变 ---------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ---------- 商品数据：已迁至后端（GET /api/products → data/products.json），启动时异步加载 ---------- */
let PRODUCTS = [];

/* ---------- 状态 ---------- */
const PAGE_SIZE = 8;
const state = {
  cat: 'all',
  sort: 'default',
  keyword: '',
  min: null,
  max: null,
  shown: PAGE_SIZE,
  cart: JSON.parse(localStorage.getItem('sp_cart') || '[]'),
  wish: JSON.parse(localStorage.getItem('sp_wish') || '[]'),
  current: null,
  curSpec: 0,
  curQty: 1
};

const $ = (id) => document.getElementById(id);
const money = (n) => '¥' + n.toFixed(2).replace(/\.00$/, '');
/* HTML 转义：所有用户可控输入（收货人/地址/轨迹文本等）插入 innerHTML 前必须过 esc，防存储型 XSS */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const starText = (r) => '★★★★★'.slice(0, Math.round(r)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(r));

/* ---------- 筛选 + 排序 ---------- */
function visibleProducts() {
  let list = PRODUCTS.filter((p) => {
    if (state.cat !== 'all' && p.cat !== state.cat) return false;
    if (state.keyword) {
      const k = state.keyword.toLowerCase();
      if (!(p.name + p.sub + p.cat).toLowerCase().includes(k)) return false;
    }
    if (state.min !== null && p.price < state.min) return false;
    if (state.max !== null && p.price > state.max) return false;
    return true;
  });
  const by = {
    priceAsc: (a, b) => a.price - b.price,
    priceDesc: (a, b) => b.price - a.price,
    sales: (a, b) => b.sold - a.sold,
    rating: (a, b) => b.rating - a.rating,
    default: (a, b) => b.hot - a.hot || a.id.localeCompare(b.id)
  };
  return list.sort(by[state.sort]);
}

/* ---------- 渲染商品网格 ---------- */
function renderGrid() {
  const list = visibleProducts();
  const slice = list.slice(0, state.shown);
  $('resultCount').textContent = `共 ${list.length} 件商品${state.cat === 'all' ? '' : ' · ' + state.cat}`;
  $('emptyTip').hidden = list.length !== 0;
  $('loadMoreBtn').parentElement.hidden = slice.length >= list.length;

  $('productGrid').innerHTML = slice.map((p, i) => {
    const inWish = state.wish.includes(p.id);
    return `
    <article class="card" style="animation-delay:${Math.min(i, 8) * 40}ms">
      <div class="card-media" data-detail="${p.id}">
        <img src="${p.img}" alt="${p.name}" loading="lazy" style="object-position:center ${p.pos}%" />
        <span class="card-tag">${p.cat}</span>
        ${p.hot ? '<span class="ribbon">热销</span>' : ''}
        <button class="fav ${inWish ? 'is-on' : ''}" data-wish="${p.id}" title="收藏">${inWish ? '♥' : '♡'}</button>
      </div>
      <div class="card-body">
        <h3 class="card-name" data-detail="${p.id}">${p.name}</h3>
        <p class="card-sub">${p.sub}</p>
        <div class="card-rate">
          <span class="stars">${starText(p.rating)}</span>
          <em style="font-style:normal">${p.rating}</em>
          <span>已售 ${p.sold > 999 ? (p.sold / 1000).toFixed(1) + 'k' : p.sold}</span>
        </div>
        <div class="price-line">
          <span class="price"><i>¥</i>${p.price.toFixed(2).replace(/\.00$/, '')}</span>
          <del>¥${p.oldPrice}</del>
        </div>
        <div class="card-foot">
          <button class="btn btn-primary" data-add="${p.id}">加入购物车</button>
          <button class="btn btn-soft" data-detail="${p.id}">查看</button>
        </div>
      </div>
    </article>`;
  }).join('');
}

/* ---------- 购物车 ---------- */
function persist() {
  localStorage.setItem('sp_cart', JSON.stringify(state.cart));
  localStorage.setItem('sp_wish', JSON.stringify(state.wish));
}
function cartCount() { return state.cart.reduce((s, i) => s + i.qty, 0); }
function cartAmount() { return state.cart.reduce((s, i) => s + i.price * i.qty, 0); }

function addToCart(id, spec, qty) {
  const p = PRODUCTS.find((x) => x.id === id);
  const key = id + '|' + spec;
  const hit = state.cart.find((c) => c.key === key);
  if (hit) hit.qty += qty;
  else state.cart.push({ key, id, name: p.name, spec, price: p.price, qty, img: p.img });
  persist();
  renderCart();
  toast(`已加入购物车 · ${p.name.slice(0, 12)}…`);
  bump($('cartBadge'));
}

function renderCart() {
  const total = cartAmount();
  const discount = total >= 499 ? 50 : 0;
  $('cartBadge').textContent = cartCount();
  $('wishBadge').textContent = state.wish.length;
  const tb = $('tabCartBadge');
  if (tb) { tb.hidden = !cartCount(); tb.textContent = cartCount(); }
  document.querySelectorAll('.js-cart-count').forEach((el) => { el.textContent = `（${cartCount()} 件）`; });
  document.querySelectorAll('.js-sum-total').forEach((el) => { el.textContent = money(total); });
  document.querySelectorAll('.js-sum-discount').forEach((el) => { el.textContent = '-' + money(discount); });
  document.querySelectorAll('.js-sum-grand').forEach((el) => { el.textContent = money(Math.max(total - discount, 0)); });

  /* 侧边抽屉与整页购物车两个容器同步渲染 */
  const html = state.cart.length
    ? state.cart.map((c) => `
      <div class="cart-item">
        <img src="${c.img}" alt="" data-detail="${c.id}" style="object-position:center 40%;cursor:pointer" />
        <div class="ci-info">
          <div class="ci-name" data-detail="${c.id}" style="cursor:pointer">${c.name}</div>
          <div class="ci-spec">规格：${c.spec}</div>
          <div class="ci-bottom">
            <span class="ci-price">${money(c.price)}</span>
            <span class="qty-ctrl">
              <button data-minus="${c.key}">−</button><span>${c.qty}</span><button data-plus="${c.key}">＋</button>
            </span>
          </div>
          <button class="ci-del" data-del="${c.key}">删除商品</button>
        </div>
      </div>`).join('')
    : '<p class="cart-empty">购物车还是空的，去挑一件雪山好物吧 🏔️</p>';
  document.querySelectorAll('.cart-list-host').forEach((el) => { el.innerHTML = html; });
}

/* ---------- 详情弹窗 ---------- */
/* 记录浏览足迹（供 AI 客服做个性化推荐） */
function trackView(id) {
  const list = JSON.parse(localStorage.getItem('sp_viewed') || '[]');
  const next = [id, ...list.filter((x) => x !== id)].slice(0, 12);
  localStorage.setItem('sp_viewed', JSON.stringify(next));
}

/* ---------- 详情内容生成（按商品 ID 确定性生成，刷新不变） ---------- */
const FEATURE_POOL = {
  '服饰鞋包': [['🪶', '轻量缓震', '高回弹中底，久走久站不累脚'], ['🌬️', '透气干爽', '工程网布鞋面，四季穿着不闷'], ['🦶', '贴合包裹', '加固后跟与足弓支撑，稳定防侧翻'], ['⛰️', '防滑耐磨', '橡胶大底多纹路，应对多种地形']],
  '户外装备': [['🎒', '轻量高强', '高强度轻量面料，背负无负担'], ['🌧️', '防泼耐雨', '涂层工艺抵御突发风雨'], ['🧩', '分区收纳', '多仓结构，取用顺手不乱'], ['🪢', '人体工学', '可调背负设计，贴合更舒适']],
  '数码影音': [['⚡', '性能强劲', '高性能方案，运行流畅不卡顿'], ['📸', '高清成像', '出色解析力，色彩还原真实'], ['🔋', '持久续航', '大容量 + 快充，告别电量焦虑'], ['💎', '精致做工', '质感机身，手感颜值兼具']],
  '电玩周边': [['🎮', '低延迟', '无线连接稳定，操作跟手不拖'], ['✋', '舒适握持', '人体工学握把，久玩不累'], ['⚙️', '可编程', '背键宏定义，自定义连招'], ['🔌', '多平台', 'PC / 主机 / 手机即插即用']],
  '生鲜果蔬': [['🚚', '产地直发', '源头现摘，全程冷链锁鲜'], ['🍑', '当季鲜果', '头茬好果，果肉饱满多汁'], ['🌱', '自然成熟', '不打蜡不催熟，吃得放心'], ['🛡️', '坏果包赔', '运输破损秒赔，售后无忧']]
};
const REVIEW_TEXTS = {
  good: ['和描述完全一致，做工细节都很到位，这个价格真的值，好评！', '第二次回购了，品质稳定，物流也快，包装严实没有破损。', '颜值在线，质感比想象中还要好，已经推荐给身边朋友了。', '客服推荐的规格刚刚好，用起来很顺手，满意度直接拉满。', '用了一段时间没问题，同价位里算很能打的，放心入。', '正品无疑，官方授权买着放心，当天付款当天就揽收了。', '对比了三家最后选的这款，收到没失望：包装仔细，细节处理干净利落。', '送礼的，对方很喜欢。出货快，随单还带了小赠品，有心了。', '特意用了一周才来评价，一切正常，家里老人也很快就上手了。', '超出预期！本来对这个价格没抱太大希望，结果质感还不错。'],
  ok: ['整体满意，就是配件少了点，要是能多送个收纳袋就更好了。', '东西不错，发货也快，唯一小遗憾是包装上的说明太简略，得自己摸索。', '使用感挺好，就是外包装有点简单，送人可能需要自己另买礼盒。', '基本符合预期，扣一星给物流，中转了一次多等了两天。'],
  mid: ['整体还行，规格建议下单前对照一下参数/尺码表，我差点选错。', '东西没问题，比预期稍微普通一点点，价格合适的话可以入。', '功能够用，细节还有提升空间，习惯性先给个中评。', '和图片相比颜色暗了一点，不影响使用，但多少有点落差。'],
  bad: ['物流太慢了，等了整整一周才到，期间问客服一直回复“在途中”，体验不好。', '收到时包装被压变形了，东西表面有一道划痕，已经联系售后处理中。', '用了一周就出现小毛病，做工还有很大提升空间，准备申请退换。', '尺寸不合适，退了又嫌麻烦，只能先凑合用，建议大家下单前看清参数。', '性价比一般，同价位对比下来不算突出，等活动降价再入手比较合适。', '第一次发货过来就是瑕疵品，虽然换货速度还行，但体验打了折扣。']
};
const SELLER_REPLIES = [
  '商家回复：非常抱歉给您带来不好的体验，客服已第一时间联系您处理。我们已反馈仓库加强包装与品控，感谢您的监督。',
  '商家回复：抱歉让您失望了，已为您开通优先退换货通道，专人跟进直到问题解决。',
  '商家回复：收到您的反馈，我们已连夜排查该批次库存并升级质检流程，期待您再次体验。'
];
const REVIEWERS = ['李**', '王**', '张**', '陈**', '刘**', '赵**', '周**', '吴**', '徐**', '孙**', '郑**', '冯**'];
const AVATAR_COLORS = ['#1f6feb', '#e4393c', '#2f9e44', '#f76707', '#7048e8', '#0b7285', '#d6336c', '#5f3dc4'];
const REVIEW_TAGS = ['性价比高', '质量好', '物流很快', '与描述一致'];
const pickFrom = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

function buildDetail(p) {
  const feats = FEATURE_POOL[p.cat] || FEATURE_POOL['数码影音'];
  const lead = `这款<b>${p.name}</b>来自雪峰优选 · ${p.cat}系列。${p.sub}。我们从选材、做工到细节反复打磨，只为把好用又好看的东西带到你身边。全场包邮 · 正品保障 · 7 天无理由退换。`;
  return { lead, feats };
}
function buildParams(p) {
  const digital = p.cat === '数码影音' || p.cat === '电玩周边';
  return [
    ['品牌', '雪峰优选 SnowPeak'], ['货号', p.id], ['分类', p.cat],
    [p.cat === '服饰鞋包' ? '可选尺码' : '可选规格', p.specs.join(' / ')],
    ['产地', '中国'], ['发货时效', '48 小时内发出'], ['配送', '全场包邮（偏远地区除外）'],
    ['售后服务', '7 天无理由 · 赠运费险'], ['质保', digital ? '全国联保 1 年' : '非人为损坏 15 天换新']
  ];
}
function buildReviews(p) {
  const rnd = mulberry32(hashStr(p.id + '_rv'));
  const total = 30 + Math.floor(rnd() * 470);
  const good = Math.max(0.55, Math.min(0.96, (p.rating - 3) / 2 + 0.42));
  const five = Math.round(total * good * 0.86);
  const four = Math.round(total * good * 0.10);
  const three = Math.round(total * (1 - good) * 0.55);
  const two = Math.round(total * (1 - good) * 0.28);
  const one = Math.max(0, total - five - four - three - two);
  const dist = [five, four, three, two, one];
  const n = 6 + Math.floor(rnd() * 3);
  const pickStars = () => { const r = rnd(); return r < 0.42 ? 5 : r < 0.66 ? 4 : r < 0.82 ? 3 : r < 0.92 ? 2 : 1; };
  const starSeq = [5, 4, 3, (rnd() > 0.5 ? 2 : 1)];
  while (starSeq.length < n) starSeq.push(pickStars());
  for (let i = starSeq.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [starSeq[i], starSeq[j]] = [starSeq[j], starSeq[i]]; }
  const textFor = (() => {
    const grp = (s) => s === 5 ? 'good' : s === 4 ? 'ok' : s === 3 ? 'mid' : 'bad';
    const used = { good: [], ok: [], mid: [], bad: [] };
    return (s) => {
      const g = grp(s), pool = REVIEW_TEXTS[g];
      const avail = pool.filter((t) => !used[g].includes(t));
      const t = pickFrom(rnd, avail.length ? avail : pool);
      used[g].push(t);
      return t;
    };
  })();
  const list = [];
  for (let i = 0; i < n; i++) {
    const stars = starSeq[i];
    const month = 5 + Math.floor(rnd() * 5), day = 1 + Math.floor(rnd() * 27);
    list.push({
      name: pickFrom(rnd, REVIEWERS), stars, text: textFor(stars),
      reply: stars <= 2 ? pickFrom(rnd, SELLER_REPLIES) : '',
      spec: p.specs[Math.floor(rnd() * p.specs.length)],
      likes: Math.floor(rnd() * 60), tag: REVIEW_TAGS[i % REVIEW_TAGS.length],
      date: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      color: pickFrom(rnd, AVATAR_COLORS), hasImg: stars >= 4 ? rnd() > 0.45 : rnd() > 0.7
    });
  }
  const tags = REVIEW_TAGS.map((t) => [t, Math.round(total * (0.28 + rnd() * 0.32))]);
  return { total, avg: p.rating, dist, list, tags };
}

function renderDetailPanel(p) {
  const { lead, feats } = buildDetail(p);
  $('mPanelDetail').innerHTML = `
    <p class="d-lead">${lead}</p>
    <div class="d-highlights">${feats.map((f) => `<div class="d-feature"><span class="df-ico">${f[0]}</span><div><strong>${f[1]}</strong><span>${f[2]}</span></div></div>`).join('')}</div>
    <div class="d-shot"><img src="${p.img}" alt="${p.name} 细节实拍" style="object-position:center ${p.pos}%" /></div>
    <p class="d-note">* 产品细节图均为实拍，因显示器差异可能存在轻微色差，最终以实物为准。</p>`;
}
function renderSpecPanel(p) {
  $('mPanelSpec').innerHTML = `<table class="param-table"><tbody>${buildParams(p).map((r) => `<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`).join('')}</tbody></table>`;
}
function renderReviewPanel(p) {
  const rv = buildReviews(p);
  const bars = rv.dist.map((c, i) => {
    const pct = rv.total ? Math.round(c / rv.total * 100) : 0;
    return `<div class="rv-bar"><span class="rb-label">${5 - i}星</span><span class="rb-track"><span class="rb-fill" style="width:${pct}%"></span></span><span class="rb-pct">${pct}%</span></div>`;
  }).join('');
  const items = rv.list.map((r, idx) => `
    <div class="rv-item" data-tag="${r.tag}">
      <div class="rv-head">
        <span class="rv-avatar" style="background:${r.color}">${r.name[0]}</span>
        <span class="rv-name">${r.name}</span><span class="rv-buyer">已购买</span>
        <span class="rv-stars">${starText(r.stars)}</span>
      </div>
      <p class="rv-text">${r.text}</p>
      ${r.hasImg ? `<div class="rv-imgs"><img src="${p.img}" alt="" style="object-position:center ${p.pos}%" /></div>` : ''}
      <div class="rv-meta"><span class="rv-spec">规格：${r.spec}</span><span>${r.date}</span><span class="rv-like" data-like="${idx}">👍 有用 <b>${r.likes}</b></span></div>
      ${r.reply ? `<div class="rv-reply">${r.reply}</div>` : ''}
    </div>`).join('');
  $('mPanelReview').innerHTML = `
    <div class="rv-summary">
      <div class="rv-score"><div class="rs-num">${rv.avg.toFixed(1)}</div><div class="rs-star">${starText(rv.avg)}</div><div class="rs-total">共 ${rv.total} 条评价</div></div>
      <div class="rv-bars">${bars}</div>
    </div>
    <div class="rv-tags">${rv.tags.map((t) => `<span class="rv-tag" data-tag="${t[0]}">${t[0]}<em>${t[1]}</em></span>`).join('')}</div>
    <div class="rv-list">${items}</div>`;
  $('mReviewCount').textContent = `(${rv.total})`;
}
function renderSizeGuide(p) {
  const sizes = p.specs.filter((s) => /^\d+$/.test(s));
  if (p.cat !== '服饰鞋包' || sizes.length < 2) { $('sizeGuideBtn').hidden = true; $('sizeGuide').hidden = true; $('sizeGuide').innerHTML = ''; return; }
  $('sizeGuideBtn').hidden = false;
  const rows = sizes.map((s) => { const n = +s; return `<tr><td>${n}</td><td>${n - 33}</td><td>${((n + 10) / 2).toFixed(1)}</td></tr>`; }).join('');
  $('sizeGuide').innerHTML = `<table><thead><tr><th>欧码 EU</th><th>参考美码 US</th><th>脚长 cm</th></tr></thead><tbody>${rows}</tbody></table><p class="sg-tip">* 脚长测量：脚后跟靠墙，从最长脚趾处量至墙面。脚背偏高/偏宽建议选大一码。</p>`;
}
function switchTab(name) {
  document.querySelectorAll('.m-tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
  document.querySelectorAll('.m-panel').forEach((el) => el.classList.toggle('is-active', el.dataset.panel === name));
}

function openDetail(id) {
  const p = PRODUCTS.find((x) => x.id === id);
  trackView(id);
  state.current = p; state.curSpec = 0; state.curQty = 1;
  $('mImg').src = p.img;
  $('mImg').style.objectPosition = `center ${p.pos}%`;
  $('mCat').textContent = p.cat;
  $('mName').textContent = p.name;
  $('mDesc').textContent = p.sub + '。库存 ' + p.stock + ' 件，48 小时内发货。';
  $('mStars').textContent = starText(p.rating) + ' ' + p.rating;
  $('mSold').textContent = `已售 ${p.sold} 件 · 库存 ${p.stock}`;
  $('mPrice').textContent = money(p.price);
  $('mOldPrice').textContent = '¥' + p.oldPrice;
  $('mQty').textContent = '1';
  $('mSpecLabel').textContent = p.cat === '服饰鞋包' ? '尺码' : '规格';
  $('mSpecs').innerHTML = p.specs.map((s, i) => `<button class="spec-btn ${i === 0 ? 'is-active' : ''}" data-spec="${i}">${s}</button>`).join('');
  renderSizeGuide(p);
  $('sizeGuide').hidden = true;
  $('sizeGuideBtn').textContent = '📏 尺码指南';
  renderDetailPanel(p);
  renderSpecPanel(p);
  renderReviewPanel(p);
  switchTab('detail');
  $('detailModal').classList.add('is-open');
  $('detailModal').setAttribute('aria-hidden', 'false');
  const box = $('detailModal').querySelector('.modal-box'); if (box) box.scrollTop = 0;
}
function closeDetail() {
  if (document.activeElement && $('detailModal').contains(document.activeElement)) document.activeElement.blur();
  $('detailModal').classList.remove('is-open');
  $('detailModal').setAttribute('aria-hidden', 'true');
}

/* ---------- 抽屉 / Toast ---------- */
function openCart(open) {
  const d = $('cartDrawer'), o = $('cartOverlay');
  d.classList.toggle('is-open', !!open);
  o.classList.toggle('is-open', !!open);
  d.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (!open && document.activeElement && d.contains(document.activeElement)) document.activeElement.blur();
  if (open) renderCart();
}
let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-show'), 1900);
}
function bump(el) {
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 340, easing: 'ease-out' });
}

/* ---------- 事件绑定 ---------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-add],[data-detail],[data-wish],[data-plus],[data-minus],[data-del],[data-spec],[data-step]');
  if (!t) return;

  if (t.dataset.add) openDetail(t.dataset.add); /* 始终弹出详情让顾客选规格后再入车 */
  if (t.dataset.detail) openDetail(t.dataset.detail);
  if (t.dataset.wish) {
    const id = t.dataset.wish;
    const i = state.wish.indexOf(id);
    i > -1 ? state.wish.splice(i, 1) : state.wish.push(id);
    persist(); renderGrid(); renderCart(); renderMe();
    toast(i > -1 ? '已取消收藏' : '已加入收藏 ⭐');
    e.stopPropagation();
  }
  if (t.dataset.plus) { state.cart.find(c => c.key === t.dataset.plus).qty++; persist(); renderCart(); }
  if (t.dataset.minus) {
    const c = state.cart.find(x => x.key === t.dataset.minus);
    c.qty--; if (c.qty <= 0) state.cart = state.cart.filter(x => x !== c);
    persist(); renderCart();
  }
  if (t.dataset.del) { state.cart = state.cart.filter(c => c.key !== t.dataset.del); persist(); renderCart(); toast('已移除商品'); }
  if (t.dataset.spec) {
    state.curSpec = +t.dataset.spec;
    $('mSpecs').querySelectorAll('.spec-btn').forEach((b, i) => b.classList.toggle('is-active', i === state.curSpec));
  }
  if (t.dataset.step && t.closest('.qty-ctrl')) {
    state.curQty = Math.max(1, state.curQty + (+t.dataset.step));
    $('mQty').textContent = state.curQty;
  }
});

/* 顶栏购物车按钮：右侧滑出侧边栏，不切页 */
$('cartBtn').onclick = () => openCart(true);
$('closeCart').onclick = () => openCart(false);
$('cartOverlay').onclick = () => openCart(false);
$('closeDetail').onclick = closeDetail;
$('detailModal').onclick = (e) => { if (e.target === $('detailModal')) closeDetail(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDetail(); openCart(false); } });

$('mAddBtn').onclick = () => {
  const p = state.current;
  addToCart(p.id, p.specs[state.curSpec], state.curQty);
  closeDetail();
};
$('mBuyBtn').onclick = () => {
  const p = state.current;
  addToCart(p.id, p.specs[state.curSpec], state.curQty);
  closeDetail(); openCart(true);
};

/* 详情标签页切换 */
$('mTabNav').addEventListener('click', (e) => {
  const b = e.target.closest('.m-tab');
  if (b) switchTab(b.dataset.tab);
});
/* 尺码指南展开/收起 */
$('sizeGuideBtn').onclick = () => {
  const g = $('sizeGuide');
  g.hidden = !g.hidden;
  $('sizeGuideBtn').textContent = g.hidden ? '📏 尺码指南' : '⤴ 收起尺码表';
};
/* 评价区：标签筛选 + “有用”点赞 */
$('mPanelReview').addEventListener('click', (e) => {
  const tag = e.target.closest('.rv-tag');
  if (tag) {
    const val = tag.dataset.tag, wasOn = tag.classList.contains('is-on');
    $('mPanelReview').querySelectorAll('.rv-tag').forEach((t) => t.classList.remove('is-on'));
    const showAll = wasOn;
    if (!wasOn) tag.classList.add('is-on');
    $('mPanelReview').querySelectorAll('.rv-item').forEach((it) => { it.style.display = (showAll || it.dataset.tag === val) ? '' : 'none'; });
    return;
  }
  const like = e.target.closest('[data-like]');
  if (like) {
    const b = like.querySelector('b');
    const on = like.classList.toggle('is-on');
    b.textContent = Math.max(0, (+b.textContent) + (on ? 1 : -1));
  }
});

document.querySelectorAll('.js-clear').forEach((b) => { b.onclick = () => { state.cart = []; persist(); renderCart(); toast('购物车已清空'); }; });
/* 下单结算：必须登录（Auth.guard 未登录时拉起登录弹窗，登录成功后自动继续）→ 进入订单确认弹窗 */
function checkoutNow() {
  if (!state.cart.length) return toast('购物车是空的');
  openOrderModal();
}
document.querySelectorAll('.js-checkout').forEach((b) => { b.onclick = () => {
  if (window.Auth) Auth.guard(checkoutNow); else checkoutNow();
}; });

/* ---------- 订单与物流 ---------- */
const ORD_STATUS = ['待发货', '已揽收', '运输中', '到达目的城市', '派送中', '已签收'];
const ORD_ST_CLS = ['st0', 'st1', 'st2', 'st2', 'st3', 'st4'];
/* 简化版省→市映射：同时用于收货地址级联选择与物流路由生成 */
const REGIONS = {
  '浙江': ['杭州', '宁波', '温州', '嘉兴'], '江苏': ['南京', '苏州', '无锡', '南通'],
  '上海': ['上海'], '北京': ['北京'], '广东': ['广州', '深圳', '东莞', '佛山'],
  '四川': ['成都', '绵阳', '宜宾'], '湖北': ['武汉', '宜昌', '襄阳'], '山东': ['济南', '青岛', '烟台'],
  '福建': ['福州', '厦门', '泉州'], '河南': ['郑州', '洛阳', '南阳'], '陕西': ['西安', '咸阳', '宝鸡'],
  '辽宁': ['沈阳', '大连'], '重庆': ['重庆'], '云南': ['昆明', '丽江', '大理'], '新疆': ['乌鲁木齐', '库尔勒', '喀什'],
};
const CITY_PROV = {};
Object.entries(REGIONS).forEach(([prov, cities]) => cities.forEach((c) => { CITY_PROV[c] = prov; }));
function fmtT(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
/* ---------- 订单数据：已迁至后端（/api/orders），本地只缓存列表用于渲染 ---------- */
let ordersCache = [];
async function fetchOrders() {
  if (!(window.Auth && Auth.isLoggedIn())) { ordersCache = []; return; }
  try {
    const data = await Auth.api('/api/orders', null, 'GET');
    if (data.ok) ordersCache = data.orders || [];
  } catch (e) { /* 网络异常时保留现有缓存 */ }
}
function fillRegionSelects(provName, cityName) {
  const sel = $('adProv'), cit = $('adCity');
  sel.innerHTML = Object.keys(REGIONS).map((p) => `<option${p === provName ? ' selected' : ''}>${p}</option>`).join('');
  const fill = () => { cit.innerHTML = REGIONS[sel.value].map((c) => `<option${c === cityName ? ' selected' : ''}>${c}</option>`).join(''); };
  fill();
  sel.onchange = fill;
}
function setOrderErr(msg) { $('orderErr').textContent = msg || ''; }
async function openOrderModal() {
  const total = cartAmount();
  const discount = total >= 499 ? 50 : 0;
  $('orderItems').innerHTML = state.cart.map((c) => {
    const p = PRODUCTS.find((x) => x.id === c.id) || {};
    return `<div class="oi-row"><img src="${c.img}" alt="" style="object-position:center ${p.pos || 50}%" /><span class="oi-name">${esc(c.name)}</span><span class="oi-spec">${esc(c.spec || '')} × ${c.qty}</span><span class="oi-price">${money(c.price * c.qty)}</span></div>`;
  }).join('');
  $('oSub').textContent = money(total);
  $('oOff').textContent = '-' + money(discount);
  $('oGrand').textContent = money(total - discount);
  /* 地址预填：后端默认地址 > 本地 sp_addr 兑底 > 注册资料（昵称/城市） */
  let saved = JSON.parse(localStorage.getItem('sp_addr') || 'null');
  if (window.Auth && Auth.isLoggedIn()) {
    try {
      const data = await Auth.api('/api/addresses', null, 'GET');
      if (data.ok && data.addresses && data.addresses.length) saved = data.addresses[0]; /* 后端已把默认地址排最前 */
    } catch (e) { /* 接口异常用本地兑底 */ }
  }
  const prof = (window.Auth && Auth.profile) || {};
  const prov0 = (saved && saved.prov) || CITY_PROV[prof.city] || '浙江';
  const city0 = (saved && saved.city) || (CITY_PROV[prof.city] ? prof.city : '杭州');
  $('adName').value = (saved && saved.name) || (window.Auth && Auth.nickname) || '';
  $('adPhone').value = (saved && saved.phone) || '';
  $('adDetail').value = (saved && saved.detail) || '';
  fillRegionSelects(prov0, city0);
  setOrderErr('');
  $('orderModal').classList.add('is-open');
  $('orderModal').setAttribute('aria-hidden', 'false');
  setTimeout(() => ($('adDetail').value ? $('adName') : $('adDetail')).focus(), 150);
}
function closeOrderModal() {
  if (document.activeElement && $('orderModal').contains(document.activeElement)) document.activeElement.blur();
  $('orderModal').classList.remove('is-open');
  $('orderModal').setAttribute('aria-hidden', 'true');
}
$('orderClose').onclick = closeOrderModal;
$('orderModal').onclick = (e) => { if (e.target === $('orderModal')) closeOrderModal(); };
$('addrForm').addEventListener('input', () => setOrderErr('')); /* 修正输入后即时清除旧错误提示 */
$('addrForm').addEventListener('change', () => setOrderErr(''));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOrderModal(); });

$('submitOrderBtn').onclick = async () => {
  if (!state.cart.length) { closeOrderModal(); return toast('购物车是空的'); }
  const addr = { name: $('adName').value.trim(), phone: $('adPhone').value.trim(), prov: $('adProv').value, city: $('adCity').value, detail: $('adDetail').value.trim() };
  if (!addr.name) return setOrderErr('请填写收货人姓名');
  if (!/^1\d{10}$/.test(addr.phone)) return setOrderErr('请填写正确的 11 位手机号');
  if (addr.detail.length < 5) return setOrderErr('请填写详细地址（至少 5 个字）');
  const btn = $('submitOrderBtn');
  btn.disabled = true;
  try {
    /* 只传商品选择与地址，价格/优惠/订单号/物流轨迹由服务端生成；clientOrderId 防连点重复下单 */
    const data = await Auth.api('/api/orders', {
      clientOrderId: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      items: state.cart.map((c) => ({ productId: c.id, spec: c.spec, qty: c.qty })),
      addr,
      saveAddr: $('adSave').checked,
    }, 'POST');
    if (!data.ok) return setOrderErr(data.msg || '下单失败，请重试');
    if ($('adSave').checked) localStorage.setItem('sp_addr', JSON.stringify(addr)); /* 本地留一份作离线兑底 */
    ordersCache.unshift(data.order);
    state.cart = []; persist(); renderCart();
    closeOrderModal();
    openCart(false);
    toast(`下单成功：${data.order.count} 件，实付 ${money(data.order.amount)}`);
    setTimeout(() => switchView('done'), 400);
  } catch (e) {
    setOrderErr('网络异常，下单失败，请重试');
  } finally {
    btn.disabled = false;
  }
};

/* ---------- “我的”页订单列表 ---------- */
const openedOrders = new Set(); /* 记录展开过物流的订单，模拟推进后不收起 */
function trackHTML(o) {
  return o.traces.map((tr, i) => {
    const cls = i < o.stage ? 'done' : i === o.stage ? 'now' : 'todo';
    const time = i <= o.stage ? fmtT(tr.t) : '等待更新';
    return `<div class="tr-item ${cls}"><span class="tr-dot"></span><div class="tr-body">${esc(tr.txt)}<span class="tr-time">${time}</span></div></div>`;
  }).join('');
}
function renderOrders() {
  const box = $('meOrders');
  if (!box) return;
  if (!(window.Auth && Auth.isLoggedIn())) {
    box.innerHTML = '<p class="order-empty">登录后可查看订单与物流，下单也需登录后进行</p>';
    return;
  }
  const list = ordersCache;
  if (!list.length) {
    box.innerHTML = '<p class="order-empty">还没有订单，去首页挑选心仪的装备，购物车点「去结算」即可下第一单</p>';
    return;
  }
  box.innerHTML = list.map((o) => {
    const cancelled = o.stage < 0;
    const closed = o.stage >= ORD_STATUS.length - 1;
    const stTxt = cancelled ? '已取消' : ORD_STATUS[o.stage];
    const stCls = cancelled ? 'st0' : ORD_ST_CLS[o.stage];
    const thumbs = o.items.slice(0, 4).map((it) => `<img src="${it.img}" alt="" />`).join('');
    const more = o.items.length > 4 ? `<span class="oc-thumb-more"><img src="${o.items[3].img}" alt="" /><em>+${o.items.length - 4}</em></span>` : '';
    const open = openedOrders.has(o.id);
    const advanceBtn = (closed || cancelled) ? '' : `<button class="primary" data-oc-advance="${o.id}">模拟物流推进</button>`;
    return `<div class="order-card" data-order="${o.id}">
      <div class="oc-head"><span class="oc-id">订单号 ${o.id}</span><span>${fmtT(o.time)}</span><span class="oc-status ${stCls}">${stTxt}</span></div>
      <div class="oc-items">${thumbs}${more}</div>
      <div class="oc-sumrow"><span>共 ${o.count} 件 · 实付 <strong class="oc-amt">${money(o.amount)}</strong></span>
        <span class="oc-btns"><button data-oc-toggle="${o.id}">${open ? '▲ 收起物流' : '📦 收货地址与物流'}</button>${advanceBtn}</span></div>
      <div class="oc-detail"${open ? '' : ' hidden'}>
        <div class="oc-addr">收货人：<b>${esc(o.addr.name)}</b>（${esc(o.addr.phone)}）<br />收货地址：<b>${esc(o.addr.prov)} ${esc(o.addr.city)}</b> ${esc(o.addr.detail)}</div>
        <div class="oc-track"><h5>物流轨迹 · ${cancelled ? '订单已取消' : (closed ? '已签收 ✅' : ORD_STATUS[o.stage])}</h5>${trackHTML(o)}</div>
      </div>
    </div>`;
  }).join('');
}
$('meOrders').addEventListener('click', async (e) => {
  const tg = e.target.closest('[data-oc-toggle]');
  const ad = e.target.closest('[data-oc-advance]');
  if (tg) {
    const id = tg.dataset.ocToggle;
    if (openedOrders.has(id)) openedOrders.delete(id); else openedOrders.add(id);
    renderOrders();
  }
  if (ad) {
    /* 推进由后端执行（stage+1 落库），前端刷新缓存后重绘 */
    const data = await Auth.api('/api/orders/' + ad.dataset.ocAdvance + '/advance', {}, 'POST');
    if (!data.ok) return toast(data.msg || '物流更新失败');
    const o = ordersCache.find((x) => x.id === ad.dataset.ocAdvance);
    if (o) o.stage = data.stage;
    openedOrders.add(ad.dataset.ocAdvance);
    renderOrders();
    toast(`物流更新：${ORD_STATUS[data.stage]}${data.stage === ORD_STATUS.length - 1 ? ' ✅ 感谢使用雪峰优选' : ''}`);
  }
});
$('accountBtn').onclick = () => switchView('me');
/* 收藏入口移至“我的”页 */
$('wishBtn').onclick = () => switchView('me');

/* 分类切换（从其他页点分类导航时回首页） */
document.querySelectorAll('.cat-link').forEach((btn) => {
  btn.onclick = () => {
    switchView('home');
    document.querySelectorAll('.cat-link').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    state.cat = btn.dataset.cat; state.shown = PAGE_SIZE;
    renderGrid();
    document.getElementById('goods').scrollIntoView({ behavior: 'smooth' });
  };
});

/* 排序 */
$('sortGroup').onclick = (e) => {
  const b = e.target.closest('.sort-btn'); if (!b) return;
  $('sortGroup').querySelectorAll('.sort-btn').forEach((x) => x.classList.remove('is-active'));
  b.classList.add('is-active');
  state.sort = b.dataset.sort; state.shown = PAGE_SIZE;
  renderGrid();
};

/* 搜索 + 价格区间 */
function applyFilter() { state.shown = PAGE_SIZE; renderGrid(); }
/* 平滑滚动到商品区（配合 CSS scroll-padding-top 避开吸顶导航）；
   延迟等切页 fadeUp 动画（280ms）结束，避免动画中计算目标位置导致过冲 */
function scrollToGoods() {
  const g = document.getElementById('goods');
  if (g) setTimeout(() => g.scrollIntoView({ behavior: 'smooth', block: 'start' }), 320);
}
$('searchBtn').onclick = () => { state.keyword = $('searchInput').value.trim(); if (state.keyword) { switchView('home'); applyFilter(); scrollToGoods(); } else applyFilter(); };
$('searchInput').addEventListener('input', (e) => { if (!e.target.value) { state.keyword = ''; applyFilter(); } });
$('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { state.keyword = e.target.value.trim(); if (state.keyword) { switchView('home'); applyFilter(); scrollToGoods(); } else applyFilter(); } });
$('rangeBtn').onclick = () => {
  const min = parseFloat($('minPrice').value), max = parseFloat($('maxPrice').value);
  state.min = isNaN(min) ? null : min;
  state.max = isNaN(max) ? null : max;
  if (state.min !== null && state.max !== null && state.min > state.max) [state.min, state.max] = [state.max, state.min];
  applyFilter();
};

/* 加载更多 */
$('loadMoreBtn').onclick = () => { state.shown += PAGE_SIZE; renderGrid(); };

/* ---------- 底部导航与视图路由 ---------- */
const VIEWS = ['home', 'service', 'cart', 'me', 'done'];
let currentView = 'home';
function switchView(name) {
  if (!VIEWS.includes(name)) name = 'home';
  const changed = name !== currentView;
  currentView = name;
  VIEWS.forEach((v) => { const el = $('view-' + v); if (el) el.classList.toggle('is-active', v === name); });
  document.querySelectorAll('.tab-item').forEach((b) => b.classList.toggle('is-active', b.dataset.view === (name === 'done' ? 'me' : name)));
  if (name === 'cart') renderCart();
  if (name === 'me') renderMe();
  if (name === 'done' && !renderDone()) { switchView('home'); return; } /* 无订单可展示时回首页 */
  if (name !== 'cart') openCart(false); /* 切页时收起侧边抽屉，避免遮罩残留 */
  if (name === 'service' && window.PeakAI && PeakAI.ensureInit) PeakAI.ensureInit(); /* 首次进入客服页加载开场白 */
  if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  if (changed) window.scrollTo(0, 0); /* 同视图内不重置滚动，避免搜索框原地回车跳回页顶 */
}
window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (VIEWS.includes(h) && h !== currentView) switchView(h);
});
$('tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('.tab-item');
  if (b) switchView(b.dataset.view);
});

/* “我的”页：登录态、统计、收藏、足迹 */
function meItem(p, unwish) {
  return `<div class="me-item" data-detail="${p.id}">
    ${unwish ? `<button class="mi-unwish" data-wish="${p.id}" title="取消收藏">♥</button>` : ''}
    <img src="${p.img}" alt="${p.name}" style="object-position:center ${p.pos}%" />
    <p class="mi-name">${p.name}</p>
    <p class="mi-price">${money(p.price)}</p>
  </div>`;
}
function renderMe() {
  if (!$('meName')) return;
  const logged = window.Auth && Auth.isLoggedIn();
  $('meName').textContent = logged ? Auth.nickname : '未登录';
  $('meTip').textContent = logged ? '登录中 · 可正常下单，全场包邮' : '登录后可正常下单、同步收藏';
  $('meLoginBtn').hidden = !!logged;
  $('meLogoutBtn').hidden = !logged;
  $('meCartN').textContent = cartCount();
  $('meWishN').textContent = state.wish.length;
  const viewed = JSON.parse(localStorage.getItem('sp_viewed') || '[]');
  $('meViewedN').textContent = viewed.length;
  const wishList = PRODUCTS.filter((p) => state.wish.includes(p.id));
  $('meWish').innerHTML = wishList.length
    ? wishList.map((p) => meItem(p, true)).join('')
    : '<p class="me-empty">还没有收藏，去首页点商品卡片右下角 ♡ 收藏喜欢的商品</p>';
  const viewList = viewed.map((id) => PRODUCTS.find((p) => p.id === id)).filter(Boolean).slice(0, 8);
  $('meViewed').innerHTML = viewList.length
    ? viewList.map((p) => meItem(p, false)).join('')
    : '<p class="me-empty">暂无浏览记录</p>';
  fetchOrders().then(renderOrders); /* 订单从后端刷新后再渲染 */
}
$('meStatCart').onclick = () => switchView('cart');
$('meStatWish').onclick = () => $('meWish').scrollIntoView({ behavior: 'smooth', block: 'center' });
$('meStatViewed').onclick = () => $('meViewed').scrollIntoView({ behavior: 'smooth', block: 'center' });

/* ---------- 订单完成页（星空背景） ---------- */
function doneStars() { /* 随机撒一层闪烁星点作装饰，只生成一次 */
  const box = $('doneStars');
  if (!box || box.childElementCount) return;
  let html = '';
  for (let i = 0; i < 36; i++) {
    const size = (Math.random() * 2.6 + 1).toFixed(1);
    html += `<i class="tw" style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 100).toFixed(1)}%;width:${size}px;height:${size}px;animation-delay:${(Math.random() * 3).toFixed(2)}s;animation-duration:${(2 + Math.random() * 2.4).toFixed(1)}s"></i>`;
  }
  box.innerHTML = html;
}
function renderDone() {
  if (!ordersCache.length) return false;
  const o = ordersCache[0]; /* 刚提交的最新订单 */
  $('doneId').textContent = o.id;
  $('doneAmt').textContent = money(o.amount);
  $('doneEta').textContent = fmtT(o.traces[4].t) + ' 前后'; /* 预计派送日 */
  $('doneAddr').innerHTML = `📍 收货：<b>${esc(o.addr.prov)} ${esc(o.addr.city)}</b> ${esc(o.addr.detail)}（${esc(o.addr.name)} 收）`;
  doneStars();
  return true;
}
document.querySelectorAll('#view-done .done-nav button').forEach((b) => {
  b.onclick = () => {
    const a = b.dataset.done;
    if (a === 'home') switchView('home');
    else if (a === 'service') switchView('service');
    else {
      switchView('me');
      const latest = ordersCache[0];
      if (!latest) return;
      if (a === 'logistics') { openedOrders.add(latest.id); renderOrders(); } /* 直接展开最新订单物流时间线 */
      setTimeout(() => { const card = document.querySelector(`.order-card[data-order="${latest.id}"]`); if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 120);
    }
  };
});

/* ---------- 对外暴露接口（AI 客服等模块复用） ---------- */
window.Shop = {
  get products() { return PRODUCTS; },
  state,
  addToCart,
  openDetail,
  openCart,
  money,
  toast,
  switchView,
  renderMe,
  filterByCategory(cat) {
    switchView('home');
    state.cat = cat; state.keyword = ''; state.shown = PAGE_SIZE;
    document.querySelectorAll('.cat-link').forEach((b) => b.classList.toggle('is-active', b.dataset.cat === cat));
    renderGrid();
    setTimeout(() => document.getElementById('goods').scrollIntoView({ behavior: 'smooth', block: 'start' }), 320);
  },
  searchKeyword(kw) {
    switchView('home');
    state.keyword = kw; state.cat = 'all'; state.shown = PAGE_SIZE;
    $('searchInput').value = kw;
    document.querySelectorAll('.cat-link').forEach((b) => b.classList.toggle('is-active', b.dataset.cat === 'all'));
    renderGrid();
    setTimeout(() => document.getElementById('goods').scrollIntoView({ behavior: 'smooth', block: 'start' }), 320);
  },
  viewed: () => JSON.parse(localStorage.getItem('sp_viewed') || '[]')
};

/* ---------- 启动：先从后端拉取商品，再渲染 ---------- */
async function boot() {
  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    if (data.ok) PRODUCTS = data.products || [];
  } catch (e) { console.error('商品加载失败，请确认 server.py 已启动', e); }
  renderGrid();
  renderCart();
  /* 稍等会话恢复（auth.js 的 /api/me）完成，保证刷新直进 #done/#me 时订单缓存就绪 */
  await new Promise((r) => setTimeout(r, 300));
  await fetchOrders();
  const h0 = location.hash.slice(1);
  switchView(VIEWS.includes(h0) ? h0 : 'home');
  /* 启动时就落在 #service：此时 chatbot.js 尚未执行，等全部脚本加载完再补初始化 */
  window.addEventListener('load', () => { if (currentView === 'service' && window.PeakAI) PeakAI.ensureInit(); });
}
boot();
