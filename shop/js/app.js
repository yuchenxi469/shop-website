/* ============================================================
   雪峰优选 · 演示购物站
   图片统一使用同一张照片（assets/mountain.jpg），价格随机生成
   ============================================================ */

const IMG = 'assets/mountain.jpg';

/* ---------- 随机数：以商品 ID 作种子，保证刷新后价格稳定 ---------- */
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

/* ---------- 商品原始清单（图片全部为同一张照片） ---------- */
const CATALOG = [
  { id: 'SP1001', cat: '户外装备', name: '高海拔四季帐篷 雪峰 Pro 2 人双层抗风款', sub: '抗 10 级风 · 3000mm 防水指数', specs: ['双人款', '三人款', '四人款'] },
  { id: 'SP1002', cat: '户外装备', name: '羽绒睡袋 -15℃ 加厚防风露营便携款', sub: '90% 白鸭绒 · 压缩后仅 380g', specs: ['常规温标', '严寒温标'] },
  { id: 'SP1003', cat: '户外装备', name: '超轻登山杖 三节折叠碳纤维款', sub: '单支 168g · 5 段长度可调', specs: ['单支装', '双支装'] },
  { id: 'SP1004', cat: '户外装备', name: '45L 专业徒步背包  Rain 防雨罩版', sub: '背负系统可调 · 内置水袋仓', specs: ['35L', '45L', '60L'] },
  { id: 'SP1005', cat: '户外装备', name: '自动充气防潮垫 双人加厚露营睡垫', sub: 'R 值 5.8 · 3 分钟自动充气', specs: ['单人', '双人'] },
  { id: 'SP1006', cat: '户外装备', name: '户外炉具套装 高山防风分体灶', sub: '3500W 大火力 · 收纳仅手掌大小', specs: ['标准套装', '含气罐套装'] },
  { id: 'SP2001', cat: '摄影器材', name: '全画幅微单相机 雪山风光套装', sub: '4430 万像素 · 5 轴防抖', specs: ['单机身', '含 24-70 镜头', '双镜头套装'] },
  { id: 'SP2002', cat: '摄影器材', name: '广角变焦镜头 16-35mm f/2.8', sub: '风光与星空利器 · 恒定大光圈', specs: ['佳能口', '索尼口', '尼康口'] },
  { id: 'SP2003', cat: '摄影器材', name: '碳纤维三脚架 超轻反折旅行款', sub: '自重 1.1kg · 承重 10kg', specs: ['标准款', '含球形云台'] },
  { id: 'SP2004', cat: '摄影器材', name: 'CPL 偏振镜 + 渐变灰滤镜套装', sub: '多层镀膜 · 压制天空过曝', specs: ['77mm', '82mm'] },
  { id: 'SP2005', cat: '摄影器材', name: '无人机 长续航航拍机 4K/60fps', sub: '34 分钟续航 · 10km 图传', specs: ['标准版', '畅飞套装'] },
  { id: 'SP2006', cat: '摄影器材', name: '摄影背包 20L 侧开快取防雨款', sub: '可容纳 2 机身 + 4 镜头', specs: ['20L', '30L'] },
  { id: 'SP3001', cat: '服饰穿搭', name: '硬壳冲锋衣 3L 压胶防水登山外套', sub: '20000mm 防水 · 全压胶缝线', specs: ['S', 'M', 'L', 'XL', '2XL'] },
  { id: 'SP3002', cat: '服饰穿搭', name: '抓绒内胆 双面磨毛高领保暖衣', sub: '可作冲锋衣内胆 · 独立可穿', specs: ['男款', '女款'] },
  { id: 'SP3003', cat: '服饰穿搭', name: '中帮防水登山鞋 全地形 Vibram 大底', sub: 'GTX 内靴 · 48h 耐磨测试', specs: ['40', '41', '42', '43', '44'] },
  { id: 'SP3004', cat: '服饰穿搭', name: '美利奴羊毛徒步袜 三双装', sub: '17.5μm 细羊毛 · 防磨起泡', specs: ['中帮三双', '高帮三双'] },
  { id: 'SP3005', cat: '服饰穿搭', name: '防晒皮肤衣 UPF50+ 轻量透气款', sub: '整衣 120g · 可收纳进口袋', specs: ['均码', '加大码'] },
  { id: 'SP3006', cat: '服饰穿搭', name: '抓绒帽 + 围脖两件套 高原保暖', sub: '摇粒绒面料 · 防风不闷汗', specs: ['石墨黑', '落日橙', '冰川蓝'] },
  { id: 'SP4001', cat: '家居生活', name: '雪山风景大幅挂画 客厅装饰画', sub: '微喷艺术纸 · 多种尺寸可定制', specs: ['40×60', '60×90', '80×120'] },
  { id: 'SP4002', cat: '家居生活', name: '钛合金保温杯 500ml 车载便携', sub: '12 小时保温 · 纯钛内胆', specs: ['450ml', '500ml', '750ml'] },
  { id: 'SP4003', cat: '家居生活', name: '香薰加湿器 静音落地氛围灯款', sub: '4L 大水箱 · 日出模拟光', specs: ['基础款', '氛围灯款'] },
  { id: 'SP4004', cat: '家居生活', name: '露营折叠桌 铝合金便携蛋卷桌', sub: '承重 60kg · 收纳仅 1.9kg', specs: ['中号', '大号'] },
  { id: 'SP4005', cat: '家居生活', name: '手冲咖啡套装 户外便携旅行版', sub: '含滤杯、分享壶、手摇磨豆机', specs: ['基础套装', '进阶套装'] },
  { id: 'SP4006', cat: '家居生活', name: '羊毛针织毯 沙发午睡盖毯', sub: '100% 澳洲羊毛 · 130×170cm', specs: ['燕麦白', '烟灰蓝', '焦糖棕'] }
];

/* ---------- 为每件商品生成随机价格 / 评分 / 销量 / 图片裁切位置 ---------- */
const PRODUCTS = CATALOG.map((p, idx) => {
  const rnd = mulberry32(hashStr(p.id));
  const price = +(29 + rnd() * 4670).toFixed(0) + (rnd() > 0.5 ? 0.9 : 0);   // 随机售价
  const oldPrice = +(price * (1.15 + rnd() * 0.65)).toFixed(0);              // 随机划线价
  const rating = +(3.6 + rnd() * 1.4).toFixed(1);                            // 随机评分
  const sold = Math.floor(rnd() * 9800) + 30;                                // 随机销量
  const stock = Math.floor(rnd() * 260) + 3;                                 // 随机库存
  const pos = [8, 22, 35, 48, 60, 72][idx % 6];                              // 同一照片不同取景
  return { ...p, price, oldPrice, rating, sold, stock, pos, hot: rnd() > 0.62 };
});

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
        <img src="${IMG}" alt="${p.name}" loading="lazy" style="object-position:center ${p.pos}%" />
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
  else state.cart.push({ key, id, name: p.name, spec, price: p.price, qty });
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
  $('drawerCount').textContent = `（${cartCount()} 件）`;
  $('cartTotal').textContent = money(total);
  $('cartDiscount').textContent = '-' + money(discount);
  $('cartGrand').textContent = money(Math.max(total - discount, 0));

  $('cartList').innerHTML = state.cart.length
    ? state.cart.map((c) => `
      <div class="cart-item">
        <img src="${IMG}" alt="" style="object-position:center 40%" />
        <div class="ci-info">
          <div class="ci-name">${c.name}</div>
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
}

/* ---------- 详情弹窗 ---------- */
/* 记录浏览足迹（供 AI 客服做个性化推荐） */
function trackView(id) {
  const list = JSON.parse(localStorage.getItem('sp_viewed') || '[]');
  const next = [id, ...list.filter((x) => x !== id)].slice(0, 12);
  localStorage.setItem('sp_viewed', JSON.stringify(next));
}

function openDetail(id) {
  const p = PRODUCTS.find((x) => x.id === id);
  trackView(id);
  state.current = p; state.curSpec = 0; state.curQty = 1;
  $('mImg').src = IMG;
  $('mImg').style.objectPosition = `center ${p.pos}%`;
  $('mCat').textContent = p.cat;
  $('mName').textContent = p.name;
  $('mDesc').textContent = p.sub + '。库存 ' + p.stock + ' 件，48 小时内发货。';
  $('mStars').textContent = starText(p.rating) + ' ' + p.rating;
  $('mSold').textContent = `已售 ${p.sold} 件 · 库存 ${p.stock}`;
  $('mPrice').textContent = money(p.price);
  $('mOldPrice').textContent = '¥' + p.oldPrice;
  $('mQty').textContent = '1';
  $('mSpecs').innerHTML = p.specs.map((s, i) => `<button class="spec-btn ${i === 0 ? 'is-active' : ''}" data-spec="${i}">${s}</button>`).join('');
  $('detailModal').classList.add('is-open');
  $('detailModal').setAttribute('aria-hidden', 'false');
}
function closeDetail() {
  $('detailModal').classList.remove('is-open');
  $('detailModal').setAttribute('aria-hidden', 'true');
}

/* ---------- 抽屉 / Toast ---------- */
function openCart(open) {
  $('cartDrawer').classList.toggle('is-open', open);
  $('overlay').classList.toggle('is-open', open);
  $('cartDrawer').setAttribute('aria-hidden', String(!open));
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

  if (t.dataset.add) addToCart(t.dataset.add, state.current && state.current.id === t.dataset.add ? state.current.specs[state.curSpec] : PRODUCTS.find(p => p.id === t.dataset.add).specs[0], 1);
  if (t.dataset.detail) openDetail(t.dataset.detail);
  if (t.dataset.wish) {
    const id = t.dataset.wish;
    const i = state.wish.indexOf(id);
    i > -1 ? state.wish.splice(i, 1) : state.wish.push(id);
    persist(); renderGrid(); renderCart();
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

$('cartBtn').onclick = () => openCart(true);
$('closeCart').onclick = () => openCart(false);
$('overlay').onclick = () => openCart(false);
$('closeDetail').onclick = closeDetail;
$('detailModal').onclick = (e) => { if (e.target === $('detailModal')) closeDetail(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { openCart(false); closeDetail(); } });

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

$('clearCartBtn').onclick = () => { state.cart = []; persist(); renderCart(); toast('购物车已清空'); };
$('checkoutBtn').onclick = () => {
  if (!state.cart.length) return toast('购物车是空的');
  const n = cartCount(), amt = cartAmount() - (cartAmount() >= 499 ? 50 : 0);
  state.cart = []; persist(); renderCart(); openCart(false);
  toast(`下单成功（演示）：${n} 件，实付 ${money(amt)}`);
};
$('accountBtn').onclick = () => toast('演示站点，暂无真实账号体系');
$('wishBtn').onclick = () => {
  if (!state.wish.length) return toast('收藏夹是空的，点卡片右下角 ♡ 试试');
  state.cat = 'all'; state.keyword = ''; $('searchInput').value = '';
  state.shown = PRODUCTS.length;
  const ids = state.wish;
  $('resultCount').textContent = `收藏夹 · ${ids.length} 件商品`;
  $('productGrid').innerHTML = PRODUCTS.filter(p => ids.includes(p.id)).map((p) => `
    <article class="card">
      <div class="card-media" data-detail="${p.id}">
        <img src="${IMG}" alt="${p.name}" style="object-position:center ${p.pos}%" />
        <span class="card-tag">${p.cat}</span>
        <button class="fav is-on" data-wish="${p.id}">♥</button>
      </div>
      <div class="card-body">
        <h3 class="card-name" data-detail="${p.id}">${p.name}</h3>
        <p class="card-sub">${p.sub}</p>
        <div class="card-rate"><span class="stars">${starText(p.rating)}</span><em style="font-style:normal">${p.rating}</em></div>
        <div class="price-line"><span class="price"><i>¥</i>${p.price}</span><del>¥${p.oldPrice}</del></div>
        <div class="card-foot"><button class="btn btn-primary" data-add="${p.id}">加入购物车</button><button class="btn btn-soft" data-detail="${p.id}">查看</button></div>
      </div>
    </article>`).join('');
  $('emptyTip').hidden = true;
  $('loadMoreBtn').parentElement.hidden = true;
  document.getElementById('goods').scrollIntoView({ behavior: 'smooth' });
};

/* 分类切换 */
document.querySelectorAll('.cat-link').forEach((btn) => {
  btn.onclick = () => {
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
$('searchBtn').onclick = () => { state.keyword = $('searchInput').value.trim(); applyFilter(); };
$('searchInput').addEventListener('input', (e) => { if (!e.target.value) { state.keyword = ''; applyFilter(); } });
$('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { state.keyword = e.target.value.trim(); applyFilter(); } });
$('rangeBtn').onclick = () => {
  const min = parseFloat($('minPrice').value), max = parseFloat($('maxPrice').value);
  state.min = isNaN(min) ? null : min;
  state.max = isNaN(max) ? null : max;
  if (state.min !== null && state.max !== null && state.min > state.max) [state.min, state.max] = [state.max, state.min];
  applyFilter();
};

/* 加载更多 */
$('loadMoreBtn').onclick = () => { state.shown += PAGE_SIZE; renderGrid(); };

/* ---------- 对外暴露接口（AI 客服等模块复用） ---------- */
window.Shop = {
  products: PRODUCTS,
  state,
  addToCart,
  openDetail,
  openCart,
  money,
  toast,
  filterByCategory(cat) {
    state.cat = cat; state.keyword = ''; state.shown = PAGE_SIZE;
    document.querySelectorAll('.cat-link').forEach((b) => b.classList.toggle('is-active', b.dataset.cat === cat));
    renderGrid();
    document.getElementById('goods').scrollIntoView({ behavior: 'smooth' });
  },
  searchKeyword(kw) {
    state.keyword = kw; state.cat = 'all'; state.shown = PAGE_SIZE;
    $('searchInput').value = kw;
    document.querySelectorAll('.cat-link').forEach((b) => b.classList.toggle('is-active', b.dataset.cat === 'all'));
    renderGrid();
    document.getElementById('goods').scrollIntoView({ behavior: 'smooth' });
  },
  viewed: () => JSON.parse(localStorage.getItem('sp_viewed') || '[]')
};

/* ---------- 启动 ---------- */
renderGrid();
renderCart();
console.log('商品价格（随机生成）：', PRODUCTS.map(p => `${p.id} ¥${p.price}`).join('\n'));
