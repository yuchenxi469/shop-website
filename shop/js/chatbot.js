/* ============================================================
   小峰 · AI 导购（纯前端实现）
   个性化依据：昵称 / 预算 / 使用场景 / 浏览足迹 / 购物车 / 收藏夹 / 历史对话
   依赖 app.js 暴露的 window.Shop 接口
   ============================================================ */
(function () {
  'use strict';

  const IMG = 'assets/products/vista-mountain.jpg';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- 用户画像（本地持久化） ---------- */
  const profile = Object.assign(
    { name: '', budget: null, scene: '', level: '', summary: '', history: [], asks: 0, greeted: false },
    JSON.parse(localStorage.getItem('sp_profile') || '{}')
  );
  const saveProfile = () => localStorage.setItem('sp_profile', JSON.stringify(profile));

  /* ---------- 大模型开关：后端配了 LLM_KEY 才走模型，否则继续用本地规则引擎 ---------- */
  let llmEnabled = false;
  let llmModel = '';

  /* 页脚声明跟着实际驱动切换，避免「不接入大模型」的说明和真实情况打架 */
  function syncFoot() {
    const el = document.getElementById('csFoot');
    if (!el) return;
    el.textContent = llmEnabled
      ? 'AI 生成回复，仅供参考 · ' + (llmModel || '大模型') + ' 驱动'
      : '本地规则引擎驱动 · 未接入大模型';
  }

  fetch('/api/chat/status')
    .then((r) => r.json())
    .then((d) => {
      llmEnabled = !!(d && d.ok && d.enabled);
      llmModel = (d && d.model) || '';
      syncFoot();
    })
    .catch(() => { llmEnabled = false; syncFoot(); });

  /* 历史转成模型格式；最后一条是刚推入的当前问题，后端会单独拼，这里去掉避免重复 */
  function chatHistory() {
    return profile.history.slice(0, -1).slice(-6)
      /* goods 一起带上：后端要靠它把「第二个」「那把」落到具体商品 */
      .map((h) => ({
        role: h.role === 'me' ? 'user' : 'assistant',
        content: h.html || '',
        goods: h.role === 'me' ? [] : (h.goods || [])
      }))
      .filter((h) => h.content);
  }

  /* 模型需要的用户记忆：只传后端用得上的字段；购物车传真实内容，避免模型自己数错件数 */
  function modelProfile() {
    return {
      name: profile.name || '',
      budget: profile.budget || '',
      scene: profile.scene || '',
      /* 旧的对话被本地压缩成摘要，模型靠它接上很久以前的话题 */
      summary: profile.summary || '',
      cartCount: cart().reduce((s, x) => s + (x.qty || 0), 0),
      cartAmount: cartTotal(),
      /* 购物车只存在浏览器里：id/spec 必须传，后端才能支撑 get_cart / 改数量 / 移除 */
      cartItems: cart().slice(0, 5).map((c) => ({
        id: c.id, spec: c.spec || '', qty: c.qty,
        name: (byId(c.id) || {}).name || c.id
      }))
    };
  }

  /* 流式请求：后端按 SSE 逐条推事件，交给 onEvent 即时渲染（打字机 / 工具状态都靠它） */
  async function askModelStream(text, onEvent) {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, history: chatHistory(), profile: modelProfile() })
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => null);
      throw new Error((data && data.msg) || ('HTTP ' + res.status));
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let cut;
      while ((cut = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        block.split('\n').forEach((line) => {
          if (!line.startsWith('data:')) return;
          const raw = line.slice(5).trim();
          if (!raw || raw === '[DONE]') return;
          let evt = null;
          try { evt = JSON.parse(raw); } catch (e) { return; }
          if (evt) onEvent(evt);
        });
      }
    }
  }

  const all = () => (window.Shop ? Shop.products : []);
  const cart = () => (Shop.state ? Shop.state.cart : []);
  const wish = () => (Shop.state ? Shop.state.wish : []);
  const viewedIds = () => Shop.viewed();
  const byId = (id) => all().find((p) => p.id === id);
  /* 上一轮卡片里展示过的商品：指代（「第二个」「这个」）全靠它落地 */
  function lastGoods() {
    for (let i = profile.history.length - 1; i >= 0; i--) {
      const list = (profile.history[i].goods || []).map(byId).filter(Boolean);
      if (list.length) return list;
    }
    return [];
  }
  /* 类型词：同品类不等于同类，耳机便宜了不能拿移动电源凑数 */
  const TYPE_KWS = ['耳机', '键盘', '鼠标', '手柄', '相机', '手机', '移动电源', '背包', '登山包', '登山杖', '帐篷', '篮球鞋', '跑步鞋', '运动鞋', '鞋', '草莓', '苹果', '柠檬', '柑', 'T恤', '卫衣'];
  const kindOf = (p) => TYPE_KWS.find((k) => (p.name || '').includes(k)) || '';
  /* 购物车只存 id/spec/qty，金额实时按商品目录计算；目录未就绪时按 0 计，不产生 NaN */
  const cartTotal = () => cart().reduce((s, c) => { const p = byId(c.id); return s + (p ? (Number(p.price) || 0) * c.qty : 0); }, 0);
  /* 促销规则由后端下发，客服不另存一份门槛与金额 */
  const promo = () => (Shop.state && Shop.state.promo) || null;

  /* ---------- 工具 ---------- */
  const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const greetWord = () => { const h = new Date().getHours(); return h < 6 ? '这么晚还没睡呀' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好'; };
  const you = () => (profile.name ? profile.name + '，' : '');
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* 中文友好的关键词匹配：用商品名的 2~4 字滑窗去命中用户输入 */
  function matchProducts(text) {
    const t = text.toLowerCase();
    return all()
      .map((p) => {
        const name = p.name.toLowerCase();
        let best = 0;
        for (let len = 4; len >= 2; len--) {
          for (let i = 0; i + len <= name.length; i++) {
            const g = name.slice(i, i + len);
            if (!/[一-龥a-z]{2,}/.test(g)) continue;
            if (t.includes(g)) { best = Math.max(best, len * 3); break; }
          }
          if (best) break;
        }
        const catHit = t.includes(p.cat.toLowerCase()) ? 5 : 0;
        const subHit = p.sub.toLowerCase().split(/[ ·]/).some((w) => w.length >= 2 && t.includes(w)) ? 4 : 0;
        return { p, score: best + catHit + subHit };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.p);
  }

  /* ---------- 搜索同义词 / 类目别名（键均为小写） ---------- */
  const SYNONYMS = {
    '手机': ['手机', 'iphone', 'iqoo', '旗舰机'],
    '耳机': ['耳机', '耳塞', '头戴', 'airpods', '蓝牙耳机'],
    '相机': ['相机', '微单', '卡片机', '拍照', 'sony'],
    '鞋': ['鞋', '球鞋', '篮球鞋', '跑步鞋', '运动鞋', '跑鞋', '板鞋'],
    '包': ['包', '背包', '双肩包', '登山包', '徒步包'],
    '登山杖': ['登山杖', '手杖', '拐杖', '雪仗'],
    '充电宝': ['充电宝', '移动电源', '电源', '快充'],
    '手柄': ['手柄', '游戏手柄', '电竞', 'ps5', 'razor', '雷蛇'],
    '键盘': ['键盘', '机械键盘', '电竞键盘'],
    '水果': ['水果', '生鲜', '柠檬', '草莓', '苹果', '橘子', '耙耙柑', '丑橘', '橙子'],
    '户外': ['户外', '露营', '徒步', '登山', '装备'],
    '数码': ['数码', '影音', '电子']
  };

  /* ---------- 商品搜索引擎：清洗关键词 → 两层匹配（原始词优先，无命中再同义扩展）→ 打分排序 ---------- */
  function searchProducts(raw) {
    const query = String(raw || '').toLowerCase().trim();
    /* 去掉搜索动词 / 停用词，只留真正的检索词 */
    const cleaned = query
      .replace(/(帮我|我想|我要|我想要|请问|有没有|有没有卖|有卖|卖|搜一下|搜索|搜|查找|查一下|查|找一下|找到|找|看看|想看|想入手|入手|来点|来一个|来一款|推荐|介绍一下|哪些|什么|那个|这个|一款|一个|的|吗|呢|要|\?|？)/g, ' ')
      .replace(/[,，、\s]+/g, ' ')
      .trim();
    const terms = (cleaned || query).split(' ').filter(Boolean);

    /* 单个检索词对单个商品的打分：类目 > 商品名 > 描述/规格 */
    const scoreWord = (p, w) => {
      if (!w) return 0;
      const name = p.name.toLowerCase();
      const cat = p.cat.toLowerCase();
      const hay = (p.name + ' ' + p.sub + ' ' + p.cat + ' ' + (p.brand || '') + ' ' + p.specs.join(' ')).toLowerCase();
      let s = 0;
      if (cat === w || cat.includes(w)) s += 7;
      if (name.includes(w)) s += 5; else if (hay.includes(w)) s += 2;
      return s;
    };
    /* strict=true 时多词要求全部命中：「iKF 键盘」不能把 iKF 耳机也捞进来；
       同义词扩展出来的词彼此是「或」关系，调用时传 false。与后端 search_products 同一套规则 */
    const scoreProduct = (p, wordList, strict = true) => {
      const hits = wordList.map((w) => scoreWord(p, w));
      if (strict && wordList.length > 1 && hits.some((h) => !h)) return 0;
      let s = 0;
      hits.forEach((h) => { s += h; });
      if (cleaned && p.name.toLowerCase().includes(cleaned)) s += 4;
      return s;
    };

    /* 第一层：用原始检索词精确命中（多词要求全部命中） */
    let scored = all().map((p) => ({ p, score: scoreProduct(p, terms) })).filter((x) => x.score > 0);

    /* 严格「且」一件没命中时退回宽松「或」，别把用户想找的东西筛没了 */
    if (!scored.length && terms.length > 1) {
      scored = all().map((p) => ({ p, score: scoreProduct(p, terms, false) })).filter((x) => x.score > 0);
    }

    /* 第二层：原始词毫无命中时，才做同义词扩展（如 iphone→手机）。
       优先用分类 key 命中：「登山鞋」只扩展成鞋，不能把登山杖也算进来；
       只有没有任何 key 命中时（如「登山」），才用 value 里的别名扩展 */
    if (!scored.length) {
      const keyHits = [], valHits = [];
      terms.forEach((term) => {
        if (!term) return;
        Object.keys(SYNONYMS).forEach((k) => {
          const arr = SYNONYMS[k];
          if (term.includes(k) || k.includes(term)) keyHits.push(arr);
          else if (arr.some((a) => a.includes(term) || term.includes(a))) valHits.push(arr);
        });
      });
      const expanded = new Set();
      (keyHits.length ? keyHits : valHits)
        .forEach((arr) => arr.forEach((w) => expanded.add(w.toLowerCase())));
      const words = [...expanded];
      scored = all().map((p) => ({ p, score: scoreProduct(p, words, false) })).filter((x) => x.score > 0);
    }

    scored.sort((a, b) => b.score - a.score || b.p.rating - a.p.rating || b.p.sold - a.p.sold);
    return { list: scored.map((x) => x.p), keyword: cleaned || query };
  }

  /* 场景 / 人群标签，用于个性化措辞 */
  const SCENES = [
    { key: '露营', words: ['露营', '野营', '营地', '扎营'] },
    { key: '徒步', words: ['徒步', '登山', '爬山', '穿越', '长线'] },
    { key: '摄影', words: ['摄影', '拍照', '航拍', '镜头', '出片'] },
    { key: '自驾', words: ['自驾', '开车', '后备箱'] },
    { key: '家用', words: ['家里', '客厅', '卧室', '日常', '通勤'] }
  ];
  const detectScene = (t) => SCENES.find((s) => s.words.some((w) => t.includes(w)))?.key || '';
  /* 场景 → 主分类：没有具体商品关键词时，按场景收窄候选，避免把鞋和充电宝凑成“户外装备” */
  const SCENE_CAT = { '露营': '户外装备', '徒步': '户外装备', '自驾': '户外装备', '摄影': '数码影音', '家用': '生鲜果蔬' };

  /* ---------- 推荐引擎：命中商品 + 预算 + 足迹同类加权 ---------- */
  /* 打分与理由同源：算分时把“为什么高”记进 why，卡片上直接展示，避免只推不说理由 */
  function scoredProducts(text, opts = {}) {
    const hits = opts.hits || matchProducts(text);
    const budget = opts.budget || profile.budget;
    const maxPrice = opts.maxPrice || 0;   // 硬上限：超过直接淘汰，而不只是扣分
    const viewedCats = viewedIds().map((id) => byId(id)?.cat).filter(Boolean);
    const scene = detectScene(text);
    let list = hits.length ? hits.slice() : all().slice();
    if (maxPrice) list = list.filter((p) => p.price <= maxPrice);

    return list.map((p) => {
      let s = p.rating * 6 + Math.log10(p.sold + 10) * 4 + (p.hot ? 8 : 0);
      const why = [];
      if (budget && p.price <= budget) {
        s += 26;
        const save = budget - p.price;
        /* 余量只在单品场景才成立：组合时总价变高，单件“余 ¥x”会误导 */
        why.push(opts.single && save >= budget * 0.25 ? `预算内，余 ¥${save.toFixed(0)}` : '预算内');
      }
      if (budget && p.price > budget * 1.35) s -= 40;
      if (viewedCats.includes(p.cat)) s += 9;
      if (wish().includes(p.id)) { s += 12; why.push('你收藏过'); }
      if (cart().some((c) => c.id === p.id)) s -= 30;      // 已买过的不再重复推
      if (scene === '露营' && p.cat === '户外装备') s += 10;
      if (scene === '摄影' && p.cat === '数码影音') s += 10;
      if (p.rating >= 4.7) why.push(`评分 ${p.rating}`);
      if (p.hot) why.push('热销');
      if (p.oldPrice > p.price * 1.4) why.push(`约 ${Math.round((1 - p.price / p.oldPrice) * 100)}% off`);
      return { p, s, why };
    }).sort((a, b) => b.s - a.s);
  }

  /* _why 只挂商品副本，不污染全局目录对象 */
  const withWhy = (x) => Object.assign({}, x.p, { _why: x.why });

  function recommend(text, opts = {}) {
    return scoredProducts(text, opts).slice(0, opts.limit || 3).map(withWhy);
  }

  /* 预算内最优组合：全站仅 21 件，枚举候选里 1-3 件的组合，取总分最高且不超预算的一组。
     同类最多 2 件，避免用一堆小件把预算“填满”却没解决需求。 */
  function bestBundle(scored, budget, maxN = 3) {
    const top = scored.length ? scored[0].s : 0;
    const pool = scored.filter((x) => x.p.price <= budget && x.s >= top * 0.5).slice(0, 12);
    let best = { picked: [], sum: 0, score: -Infinity };
    const picked = [], catCount = {};
    const walk = (start, sum, score) => {
      if (picked.length && score > best.score) best = { picked: picked.slice(), sum, score };
      if (picked.length >= maxN) return;
      for (let i = start; i < pool.length; i++) {
        const x = pool[i];
        if (sum + x.p.price > budget) continue;
        if ((catCount[x.p.cat] || 0) >= 2) continue;
        picked.push(x); catCount[x.p.cat] = (catCount[x.p.cat] || 0) + 1;
        walk(i + 1, sum + x.p.price, score + x.s);
        picked.pop(); catCount[x.p.cat] -= 1;
      }
    };
    walk(0, 0, 0);
    return { list: best.picked.map(withWhy), sum: best.sum || 0 };
  }

  /* 量词判断：说“一套/清单/装备”是要组合；说“一双/一个”或只涉及一个品类，是要单品 */
  function wantsSingle(t, hits) {
    if (/(一套|清单|全套|配齐|组合|套装|都买)/.test(t)) return false;
    if (/(一双|一对|一个|一件|一款|一条|一台|一部|一顶|买一)/.test(t)) return true;
    if (!hits.length) return false;
    return new Set(hits.map((p) => p.cat)).size === 1;
  }

  /* ---------- 意图库 ---------- */
  const INTENTS = [
    {
      id: 'greeting',
      kw: ['你好', '在吗', 'hi', 'hello', '嗨', '哈喽'],
      run: (t) => {
        const items = all();
        const hot = items.slice().sort((a, b) => (b.sold || 0) - (a.sold || 0))[0];
        const who = profile.name ? '，' + esc(profile.name) : '';
        return {
          text: `${greetWord()}${who}！我是小峰 🏔️\n\n` +
            (hot ? `店里 ${items.length} 件货，卖得最凶的是 <b>${esc(hot.name.split(' ')[0])}</b>，已经出了 ${hot.sold} 单。\n\n` : '') +
            `想买什么？丢个关键词，或者给个预算，我帮你挑。`,
          chips: ['预算 500 元推荐', '新手第一次露营', '有什么优惠券']
        };
      }
    },
    {
      id: 'identity',
      kw: ['你是谁', '你叫什么', '机器人', '是 ai', '人工智能', '真人吗'],
      run: () => ({
        text: `我是<b>小峰</b>，雪峰优选的导购 🏔️\n我读得到你的<b>浏览足迹、购物车和收藏夹</b>，推荐会跟着你的偏好走；也会记住你的预算和常玩的场景。\n（配了大模型 key 时由模型作答，没配就走本地规则引擎，两种都能用）`,
        chips: ['根据我浏览过的推荐', '看看我的收藏']
      })
    },
    {
      id: 'budget',
      kw: ['预算', '块以内', '元左右', '性价比', '平价', '推荐'],
      rx: /(?:预算|控制在|不超过|最多|大概|只有)\s*(\d{2,5})|(\d{3,5})\s*(?:元|块)|(\d{2,4})\s*[kK](?![gG])/,
      run: (t, m) => {
        const num = m ? +([m[1], m[2], m[3]].find((x) => x) || 0) || null : null;
        const budget = num || profile.budget;
        if (!budget) {
          return { text: '想帮你挑东西，但不知道上限会挑偏 —— 大概准备花多少？比如「预算 500」。', chips: ['预算 300 元推荐', '预算 800 元推荐', '预算 2000 元推荐'] };
        }
        profile.budget = budget; saveProfile();
        const sceneKey = detectScene(t) || profile.scene;
        /* 商品名滑窗对“登山鞋”这类说法匹配不到，用同义词搜索引擎兑底；再不行按场景收窄分类 */
        const affordable = (list) => list.filter((p) => p.price <= budget);
        let hits = matchProducts(t);
        /* 命中但全超预算（如“登山鞋”只匹配到 ¥1741 的登山杖）时也要换路，不能直接判空 */
        if (!affordable(hits).length) {
          const alt = searchProducts(t).list;
          if (affordable(alt).length) hits = alt;
        }
        if (!affordable(hits).length && SCENE_CAT[sceneKey]) hits = all().filter((p) => p.cat === SCENE_CAT[sceneKey]);
        const single = wantsSingle(t, hits);
        /* 价格上限是硬约束：超预算的商品不进候选，而不是“分低一点” */
        const scored = scoredProducts(t, { budget, maxPrice: budget, hits, single });

        if (!scored.length) {
          const floor = Math.min(...all().map((p) => p.price));
          const what = SCENE_CAT[sceneKey] || '商品';
          return {
            text: `预算 <b>¥${budget}</b> 内没有合适的${what} 😢\n全站最低价是 ¥${floor}，要不把预算调到 ¥${Math.round(budget * 1.4)} 再看看？`,
            chips: [`预算 ${Math.round(budget * 1.4)} 元推荐`, '看看最便宜的', '按我的偏好推荐']
          };
        }

        /* 单品需求：「800 以内的一双鞋」只在预算内排序，不硬拼组合 */
        if (single) {
          return {
            text: `${num ? '收到' + you() : '先按之前记住的'}预算 <b>¥${budget}</b>。\n这几件都在预算内，按<b>评分、销量和你的偏好</b>排序：`,
            goods: scored.slice(0, 3).map(withWhy),
            chips: ['再换一批', '把这些加入购物车', '有没有更便宜的']
          };
        }

        /* 组合需求：枚举出总价不超预算、总分最高的一组 */
        const bundle = bestBundle(scored, budget);
        const focus = SCENE_CAT[sceneKey] || (new Set(hits.map((p) => p.cat)).size === 1 ? hits[0].cat : '');
        /* 只有一件时不说“清单”：户外装备最低 ¥1741，预算 3000 也就能装下一件 */
        const head = bundle.list.length > 1 ? (focus ? `给你配了${focus}清单` : '给你配了这一组') : '给你挑了一件';
        if (!bundle.list.length) {
          return {
            text: `预算 <b>¥${budget}</b> 内暂时凑不出一套${focus || '合适'}的，先从单品看起：`,
            goods: scored.slice(0, 2).map(withWhy),
            chips: [`预算 ${Math.round(budget * 1.5)} 元推荐`, '看看最便宜的']
          };
        }
        const left = budget - bundle.sum;
        const rows = bundle.list.map((p) => `· ${p.name} ¥${p.price}`).join('\n');
        return {
          text: `${num ? '收到' + you() : '先按之前记住的'}预算 <b>¥${budget}</b>，${head}。\n从 ${scored.length} 件候选里挑出 <b>${bundle.list.length} 件</b>，合计 <b>¥${bundle.sum.toFixed(0)}</b>${left >= 1 ? `，还余 ¥${left.toFixed(0)}` : '，刚好卡在预算上'}：\n${rows}\n\n搭配思路：核心需求优先，同类最多 2 件，避免重复花钱。`,
          goods: bundle.list,
          chips: ['再换一批', '把这些加入购物车', '有没有更便宜的']
        };
      }
    },
    {
      id: 'again',
      kw: ['换一批', '再来一批', '换几件', '重新推荐', '再看几件'],
      run: () => {
        /* 上一轮推过的商品从对话历史里取，避免重复推同一批 */
        const last = [...profile.history].reverse().find((h) => h.role === 'bot' && h.goods && h.goods.length);
        const seen = last ? last.goods : [];
        const budget = profile.budget;
        const list = scoredProducts('', { budget, maxPrice: budget || 0 })
          .filter((x) => !seen.includes(x.p.id))
          .slice(0, 3)
          .map(withWhy);
        if (!list.length) return { text: '能推的我都推过一轮了 😅 不如说说具体使用场景，我按场景再筛一遍。', chips: ['新手第一次露营', '按我的偏好推荐'] };
        return { text: '换了一批，这次避开刚推过的：', goods: list, chips: ['再换一批', '按我的偏好推荐'] };
      }
    },
    {
      id: 'search',
      kw: ['搜索', '搜一下', '查找', '有没有', '想看', '找一下', '帮我找', '有卖', '有没有卖', '来点', '找'],
      rx: /(?:搜索|搜一下|搜|查找|查|找一下|找|有没有|想看|帮我找|入手)\s*([一-龥a-zA-Z0-9 ]{1,20})/,
      run: (t) => {
        const { list, keyword } = searchProducts(t);
        /* 无检索词（如只输入了“搜索”两字）且没命中→交给兵底提示 */
        if (!keyword || !keyword.replace(/\s/g, '')) return null;
        if (!list.length) {
          return {
            text: `没找到和「<b>${esc(keyword)}</b>」匹配的商品 🙈\n换个关键词试试，或直接点下面的分类浏览：`,
            chips: ['服饰鞋包', '户外装备', '数码影音', '电玩周边', '生鲜果蔬']
          };
        }
        const top = list.slice(0, 6);
        const extra = `<button class="cs-searchall" data-cs-searchall="${esc(keyword)}">🔍 共 ${list.length} 件·在商城查看全部</button>`;
        return {
          text: `${you()}按「<b>${esc(keyword)}</b>」找到 <b>${list.length}</b> 件商品，最相关的 ${top.length} 件：`,
          goods: top,
          extra,
          chips: ['看看热销', '帮我对比一下', '这件有货吗']
        };
      }
    },
    {
      id: 'price',
      kw: ['多少钱', '价格', '售价', '什么价', '贵不贵'],
      run: (t) => {
        const hits = matchProducts(t);
        if (!hits.length) {
          const cheap = all().slice().sort((a, b) => a.price - b.price)[0];
          return { text: `想问哪一件？说出商品名我就报价。\n全站目前<b>最低价</b>是「${cheap.name}」¥${cheap.price}，最高 ¥${Math.max(...all().map((p) => p.price))}，价差挺大，建议先告诉我预算～`, chips: ['预算 300 元推荐', '怎么用最划算'] };
        }
        const p = hits[0];
        const off = ((1 - p.price / p.oldPrice) * 100).toFixed(0);
        return {
          text: `「${p.name}」现在活动价 <b>¥${p.price}</b>，划线价 ¥${p.oldPrice}（约 ${off}% off）。\n库存 ${p.stock} 件${p.stock < 30 ? '，<b>剩得不多了</b>' : ''}，48 小时内发货。`,
          goods: [p],
          chips: ['加入购物车', '有更便宜的同款吗', '能用优惠券吗']
        };
      }
    },
    {
      id: 'coupon',
      kw: ['优惠', '券', '满减', '打折', '折扣', '活动', '省'],
      run: () => {
        const items = cart();
        const total = cartTotal();
        const pr = promo();
        if (!pr) return { text: '满减活动与门槛以结算页显示为准～ 全场包邮、下单送 300 积分是长期有效的。', chips: ['预算 500 元推荐', '怎么退货'] };
        const gap = pr.threshold - total;
        let text = `当前活动：<b>满 ${pr.threshold} 减 ${pr.off}</b>、全场包邮、下单送 300 积分。\n`;
        /* 用购物车条目数判断“空车”，而不是金额：商品目录尚未加载时金额会暂为 0 */
        if (items.length && gap > 0) {
          const add = recommend('户外装备', { budget: gap + 20, limit: 2 }).filter((p) => p.price <= gap + 5);
          text += `${you()}购物车已有 ¥${total.toFixed(0)}，<b>再凑 ¥${gap.toFixed(0)}</b> 就能减 ${pr.off} —— 相当于打 ${((1 - pr.off / pr.threshold) * 10).toFixed(1)} 折。这两件刚好补上：`;
          return { text, goods: add.length ? add : recommend('生鲜果蔬', { budget: gap, limit: 2 }), chips: ['去结算', '换一批凑单品'] };
        }
        if (!items.length) text += '购物车还空着，先挑两件？告诉我预算和场景，我来配清单。';
        else text += `你的购物车已经 ¥${total.toFixed(0)}，<b>满减已达成</b>，直接结算就能减 ${pr.off} 🎉`;
        return { text, chips: ['预算 500 元推荐', '新手第一次露营'] };
      }
    },
    {
      id: 'shipping',
      kw: ['发货', '快递', '几天到', '多久到', '运费', '包邮', '物流', '签收'],
      run: () => ({
        text: `📦 <b>发货与配送</b>\n· 全场包邮（新疆/西藏/港澳台需补 12 元运费）\n· 每日 16:00 前付款当天发出，其余次日 12:00 前发出\n· 顺丰/京东物流，一般 1-3 天到，偏远地区 4-5 天\n\n需要我帮你查具体订单的话，把订单号发给我。`,
        chips: ['怎么退货', '有什么优惠券']
      })
    },
    {
      id: 'refund',
      kw: ['退货', '换货', '退款', '七天', '无理由', '售后', '质量问题', '发票'],
      run: () => ({
        text: `🛡️ <b>售后政策</b>\n· 7 天无理由退换（吊牌完整、不影响二次销售）\n· 15 天内质量问题免费换新，运费我们承担\n· 退换货运费险已默认赠送，上门取件 0 元\n· 电子发票下单时勾选，3 个工作日内发送到邮箱\n\n${profile.name ? esc(profile.name) + ' 放心' : '放心'}，户外用品只要没下地用过都特别好退。`,
        chips: ['尺码不合适能换吗', '帮我推荐']
      })
    },
    {
      id: 'size',
      kw: ['尺码', '码数', '多大码', '身高', '体重', '偏大', '偏小', '选哪码', 'kg', '公斤', 'cm', '厘米'],
      rx: /(\d{2,3})\s*(?:kg|公斤)?[\s,\/]*(\d{2,3})?\s*(?:cm|厘米)?/i,
      run: (t, m) => {
        const hits = matchProducts(t);
        const isShoe = hits.some((p) => /鞋|袜/.test(p.name));
        /* 从输入里拽出两个数字，大的当身高、小的当体重 */
        const nums = (t.match(/\d{2,3}/g) || []).map(Number).filter((n) => n >= 25 && n <= 230);
        const h = nums.find((n) => n >= 140) || null;
        const w = nums.find((n) => n < 140) || null;
        let advice = '';
        if (h && w) {
          const bmi = w / Math.pow(h / 100, 2);
          const size = isShoe ? '42' : bmi > 24 ? 'XL' : bmi < 18.5 ? 'M' : 'L';
          profile.body = { h, w }; saveProfile();  // 记住身材，下次直接套用
          advice = `按身高 ${h}cm / 体重 ${w}kg（BMI ${bmi.toFixed(1)}）算，建议选 <b>${size}${isShoe ? ' 码' : ''}</b>。\n${isShoe ? '登山鞋建议比运动鞋大半码，穿厚袜不顶脚趾。' : '冲锋衣里面要套抓绒，所以宁可大一码不选小。'}`;
        } else {
          advice = `把<b>身高 + 体重</b>告诉我（例如「175 65kg」），我直接算码数。\n服装类整体<b>偏大半码</b>，鞋类建议比日常鞋大半码。`;
        }
        return { text: `📏 <b>尺码建议</b>\n${advice}`, goods: hits.slice(0, 1), chips: ['175 65kg', '不合适能换吗'] };
      }
    },
    {
      id: 'stock',
      kw: ['有货', '库存', '缺货', '补货', '现货', '还有吗'],
      run: (t) => {
        const hits = matchProducts(t);
        if (!hits.length) return { text: `全站 ${all().length} 件商品<b>均有现货</b>，库存最少的那几件我会在卡片上标「热销」。想看哪件？`, chips: ['看看热销', '预算 500 元推荐'] };
        const p = hits[0];
        return {
          text: `「${p.name}」当前库存 <b>${p.stock}</b> 件，${p.stock < 30 ? '比较紧张，建议先拍下' : '充足'}；规格有：${p.specs.join(' / ')}。`,
          goods: [p], chips: ['加入购物车', '多久发货']
        };
      }
    },
    {
      id: 'compare',
      kw: ['对比', '哪个好', '区别', '选哪个', 'vs', '还是'],
      run: (t) => {
        const hits = matchProducts(t).slice(0, 2);
        if (hits.length < 2) return { text: `想对比哪两件？说出两个名字就行，比如「登山包和登山杖哪个好」。`, chips: ['新手先买什么'] };
        const [a, b] = hits;
        const cheaper = a.price <= b.price ? a : b;
        const better = a.rating >= b.rating ? a : b;
        const priceGap = Math.abs(a.price - b.price);
        const rateGap = Math.abs(a.rating - b.rating);
        const soldGap = Math.abs(a.sold - b.sold);
        const pricePct = Math.max(a.price, b.price) ? priceGap / Math.max(a.price, b.price) : 0;
        const soldPct = Math.max(a.sold, b.sold) ? Math.round(soldGap / Math.max(a.sold, b.sold) * 100) : 0;
        /* 每行带差值，用户不用自己心算 */
        const rows = [
          `· 价格：¥${a.price} / ¥${b.price}（${priceGap ? `${cheaper.name} 省 ¥${priceGap.toFixed(0)}` : '持平'}）`,
          `· 评分：${a.rating} / ${b.rating}（${rateGap ? `${better.name} 高 ${rateGap.toFixed(1)}` : '持平'}）`,
          `· 销量：${a.sold} / ${b.sold}（${soldGap ? `${a.sold > b.sold ? a.name : b.name} 高 ${soldPct}%` : '持平'}）`,
          `· 规格：${a.specs.join(' / ')} ｜ ${b.specs.join(' / ')}`
        ];
        /* 结论只给有数据支撑的那几条，不硬编 */
        const verdict = [];
        if (profile.budget) {
          if (profile.budget >= Math.max(a.price, b.price)) verdict.push(`预算 ¥${profile.budget} 两件都够，预算不限制选择`);
          else if (profile.budget >= Math.min(a.price, b.price)) verdict.push(`预算 ¥${profile.budget} 只够 ${cheaper.name}，不想超支就选它`);
          else verdict.push(`两件都超过预算 ¥${profile.budget}，建议等满减或先买一件`);
        }
        if (rateGap >= 0.3) verdict.push(`评分差 ${rateGap.toFixed(1)}，口碑差距明显，选 ${better.name} 更稳`);
        if (pricePct >= 0.2) verdict.push(`价差 ${Math.round(pricePct * 100)}%，预算紧就选 ${cheaper.name}`);
        if (!verdict.length) verdict.push('两件在价格和口碑上很接近，主要看规格是否匹配你的使用场景');
        return {
          text: `🆚 <b>${a.name}</b> vs <b>${b.name}</b>\n${rows.join('\n')}\n\n<b>怎么选</b>\n${verdict.map((v) => '· ' + v).join('\n')}`,
          goods: hits,
          chips: ['我预算 800', '新手先买什么', '看看热销']
        };
      }
    },
    {
      id: 'newbie',
      kw: ['新手', '第一次', '小白', '入门', '怎么开始', '先买什么', '清单'],
      run: (t) => {
        const scene = detectScene(t) || '露营';
        profile.scene = scene; saveProfile();
        const cat = scene === '摄影' ? '数码影音' : scene === '家用' ? '生鲜果蔬' : '户外装备';
        const list = all().filter((p) => p.cat === cat).sort((a, b) => b.rating * b.sold - a.rating * a.sold).slice(0, 3);
        return {
          text: `🎒 <b>${scene}新手三步走</b>（${you()}我按优先级排好了）\n1️⃣ 先解决「待得住」：遮蔽 + 保暖，别急着买花哨小件\n2️⃣ 再解决「走得动」：鞋和背包最值得花钱\n3️⃣ 最后补「拍得美」：出片装备等熟练了再上\n\n按 ${cat} 里口碑最好的三件起步：`,
          goods: list, chips: ['这套一共多少钱', '预算 800 换一批', '要带哪些小物']
        };
      }
    },
    {
      id: 'spec',
      kw: ['防水', '多重', '重量', '材质', '能扛', '温度', '参数', '尺寸', '耐用', '几度'],
      run: (t) => {
        const hits = matchProducts(t);
        if (!hits.length) return { text: `参数类问题请带上商品名，例如「帐篷防水等级多少」。`, chips: ['看看热销'] };
        const p = hits[0];
        const extra = /防水|几度|抗/.test(t) ? '这件的标称在同类里属于中上水平，实际高原一夜没问题。' : '日常强度使用完全够，正常保养能用 3 年以上。';
        return {
          text: `🔧 <b>${p.name}</b>\n· 官方描述：${p.sub}\n· 可选规格：${p.specs.join(' / ')}\n· 参考价：¥${p.price}（原价 ¥${p.oldPrice}）\n${extra}`,
          goods: [p], chips: ['加入购物车', '和同款对比']
        };
      }
    },
    {
      id: 'cartView',
      kw: ['购物车', '买了什么', '加购', '凑单', '结算', '下单', '去支付'],
      run: (t) => {
        const c = cart();
        if (!c.length) return { text: `购物车还空着 ${you()}🙂 说个预算或场景，我马上给你配一套。`, chips: ['预算 500 元推荐', '新手第一次露营'] };
        const total = cartTotal();
        const pr = promo();
        const gap = pr ? pr.threshold - total : 0;
        const sum = c.map((x) => {
          const p = byId(x.id);
          return `· ${(p ? p.name : '已下架商品').slice(0, 14)}…（${x.spec}）×${x.qty} = ¥${((p ? p.price : 0) * x.qty).toFixed(0)}`;
        }).join('\n');
        let text = `🛒 你的购物车（${c.reduce((s, x) => s + x.qty, 0)} 件）\n${sum}\n\n合计 <b>¥${total.toFixed(0)}</b>` +
          (pr ? (gap > 0 ? `，再买 ¥${gap.toFixed(0)} 可减 ${pr.off}（等于省 ${(pr.off / gap * 100).toFixed(0)}%）` : `，<b>满减已达成</b>，可减 ${pr.off} 🎉`) : '');
        if (/加购|下单|结算|去支付|打开购物车/.test(t)) { Shop.openCart(true); toggle(false); text += '\n已经帮你打开购物车（客服先收起），点「去结算」即可～'; }
        return { text, chips: pr && gap > 0 ? ['帮我凑单', '打开购物车'] : ['去结算', '再推荐点别的'] };
      }
    },
    {
      id: 'wishView',
      kw: ['收藏', '喜欢', '心愿', '收藏夹'],
      run: () => {
        const ids = wish();
        if (!ids.length) return { text: `你还没收藏过商品。商品卡片右下角的 ♡ 点一下就收藏，我之后推荐会优先按收藏的口味来。`, chips: ['看看热销'] };
        const list = ids.map(byId).filter(Boolean);
        const cats = [...new Set(list.map((p) => p.cat))];
        return {
          text: `⭐ 你收藏了 ${list.length} 件，主要在 <b>${cats.join('、')}</b>。\n我记下了这个偏好，接下来推荐会往这个方向靠。要不要趁活动拿下？`,
          goods: list.slice(0, 3), chips: ['按收藏风格再推几件', '加入购物车']
        };
      }
    },
    {
      id: 'history',
      kw: ['浏览过', '看过', '足迹', '刚刚看', '最近看'],
      run: () => {
        const list = viewedIds().map(byId).filter(Boolean);
        if (!list.length) return { text: `还没有浏览记录哦，先随便看看，我会记住你感兴趣的类型。`, chips: ['看看热销'] };
        return { text: `👀 你最近看过这 ${list.length} 件：\n${list.slice(0, 5).map((p) => `· ${p.name.slice(0, 18)}… ¥${p.price}`).join('\n')}\n要不要我把其中打折最狠的一件挑出来？`, goods: list.slice(0, 3), chips: ['挑折扣最大的', '加入购物车'] };
      }
    },
    {
      id: 'cheaper',
      kw: ['更便宜', '便宜点', '便宜一点', '再低', '少点', '平价替代', '划算', '太贵了', '贵了'],
      run: (t) => {
        /* 有上一轮卡片就先锚定它：用户说的「便宜点」是相对刚才那件而言的 */
        const shown = lastGoods();
        if (shown.length) {
          const anchor = shown.reduce((a, b) => (a.price <= b.price ? a : b));
          const kind = kindOf(anchor);
          const alt = all()
            .filter((p) => p.price < anchor.price && (kind ? kindOf(p) === kind : p.cat === anchor.cat))
            .sort((a, b) => a.price - b.price)
            .slice(0, 3);
          if (!alt.length) {
            return {
              text: `刚才那件 <b>${esc(anchor.name)}</b> ¥${anchor.price} 已经是「${kind || anchor.cat}」里最便宜的了，没更低的。\n要么就它，要么我换个品类帮你找同价位替代——你说方向。`,
              goods: [anchor], chips: ['换个品类看看', '就它了', '帮我凑满减']
            };
          }
          return {
            text: `比你刚看的 <b>${esc(anchor.name)}</b>（¥${anchor.price}）更便宜的有这几件，都在 ${anchor.cat}：`,
            goods: alt, chips: ['第一个多少钱', '这个有货吗', '帮我对比一下']
          };
        }
        const base = profile.budget || cartTotal() || 600;
        const list = all().filter((p) => p.price <= base * 0.75).sort((a, b) => b.rating - a.rating).slice(0, 3);
        return {
          text: `💡 按「不超过 ¥${(base * 0.75).toFixed(0)}」重挑了一轮，都是<b>评分优先</b>的实惠款：\n（提示：把价格区间筛到 0-${(base * 0.75).toFixed(0)} 也能自己扫一遍）`,
          goods: list, chips: ['就这个价了', '帮我凑满减']
        };
      }
    },
    {
      id: 'ref',
      /* 只认明确的指代表达，避免「这个」这类泛词把正常搜索吃掉 */
      kw: ['第一个', '第二个', '第三个', '第1个', '第2个', '第3个', '最后一个', '刚才那个', '刚才那件', '上一个', '上一件'],
      rx: /第\s*[1-9一二三四五六七八九十]\s*[个件款把]?|最后(?:一个|那[个件款])|刚才那[个件款]|上一[个件款]/,
      run: (t) => {
        const shown = lastGoods();
        if (!shown.length) {
          return { text: '你说的是哪件？我这边还没推过商品，先把想找的东西说一下，我再给你排。', chips: ['预算 500 元推荐', '看看热销'] };
        }
        let idx = -1;
        /* 「第10个」「第二十一个」都要能认：只取一位就会当成第 1 / 第 2 件 */
        const m = /第\s*(\d{1,2}|[一二三四五六七八九十]{1,3})\s*[个件款把]?/.exec(t);
        if (m) {
          const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
          const raw = m[1];
          if (/^\d+$/.test(raw)) idx = +raw - 1;
          else if (raw.includes('十')) {
            const [a, b] = raw.split('十');
            idx = ((a ? CN[a] : 1) * 10 + (b ? CN[b] : 0)) - 1;
          } else idx = (CN[raw] || 0) - 1;
        }
        else if (/最后/.test(t)) idx = shown.length - 1;
        else if (/上一|刚才/.test(t)) {
          /* 卡片不止一件时不猜：列出来让他选，猜错比多问一句代价大 */
          if (shown.length > 1) {
            return {
              text: `上一轮推了 <b>${shown.length} 件</b>，你说的「刚才那个」是哪一件？\n` +
                shown.map((p, i) => `${i + 1}. ${esc(p.name.split(' ')[0])} ¥${p.price}`).join('\n'),
              goods: shown,
              chips: shown.slice(0, 3).map((p, i) => `第${i + 1}个`)
            };
          }
          idx = 0;
        }
        if (idx < 0 || idx >= shown.length) {
          return {
            text: `上一轮一共推了 <b>${shown.length} 件</b>，没有第 ${m ? m[1] : idx + 1} 件。要不要我按新条件重排一轮？`,
            chips: ['再推一遍', '换个条件']
          };
        }
        const p = shown[idx];
        return {
          text: `上一轮第 ${idx + 1} 件是 <b>${esc(p.name)}</b>\n· ¥${p.price}（原价 ¥${p.oldPrice}）\n· ${p.rating} 分 · 已售 ${p.sold} · 库存 ${p.stock} 件\n· ${p.sub || ''}`,
          goods: [p], chips: ['加入购物车', '有更便宜的吗', '这个有货吗']
        };
      }
    },
    {
      id: 'human',
      kw: ['人工', '转客服', '投诉', '差评', '客服', '电话', '找个人'],
      run: () => ({
        text: `需要真人帮忙的话：\n· 客服热线 <b>400-8888-0000</b>（9:00-23:00）\n· 邮箱 hi@snowpeak.demo，24 小时内回复\n· 页面上任何订单问题，我可以先帮你记录，你直接说情况就行\n\n要是我哪里答得不好，也欢迎直接吐槽，我会改。`,
        chips: ['我先说说问题', '继续让 AI 回答']
      })
    },
    {
      id: 'thanks',
      kw: ['谢谢', '感谢', '太好了', '辛苦', '棒', 'ok 了', '解决了'],
      run: () => ({ text: pick([`不客气 ${you()}🏔️ 需要的时候随时喊我，我一直在线。`, `小事一桩～ 逛累了也可以让我给你随机推几件冷门好货。`]), chips: ['再推荐几件', '帮我凑满减'] })
    },
    {
      id: 'bye',
      kw: ['再见', '拜拜', '不用了', '关闭', '结束'],
      run: () => ({ text: `好嘞，随时回来找我 ${you()}👋 购物车里的东西我帮你留着（本地保存，刷新也不丢）。`, chips: ['打开购物车', '再看看别的'] })
    },
    {
      id: 'pay',
      kw: ['支付', '付款', '花呗', '分期', '信用卡', '支付方式'],
      run: () => ({
        text: `💳 支持：支付宝 / 微信 / 云闪付 / 银行卡 / <b>花呗 3-12 期免息</b>（满 999 可用）。\n演示站点不会真实扣款，放心点结算。`,
        chips: ['去结算', '有什么优惠券']
      })
    },
    {
      id: 'name',
      rx: /(?:我叫|我是|我的名字是|称呼我)\s*([一-龥a-zA-Z0-9_]{1,12})/,
      kw: [],
      run: (t, m) => {
        profile.name = m[1]; saveProfile();
        return { text: `记住了，<b>${esc(m[1])}</b> 🙌 之后聊天和推荐我都会这么称呼你。\n${profile.budget ? `预算 ${profile.budget} 元、` : ''}${profile.scene ? `偏好${profile.scene}，` : ''}要不要现在就开始挑？`, chips: ['按我的偏好推荐', '预算 800 元推荐'] };
      }
    },
    {
      id: 'random',
      kw: ['随便', '随机', '冷门', '逛逛', '看看热销', '热销', '卖得好'],
      run: (t) => {
        const hot = /热销|卖得好/.test(t);
        const list = hot
          ? all().slice().sort((a, b) => b.sold - a.sold).slice(0, 3)
          : all().slice().sort((a, b) => a.sold - b.sold).slice(0, 3);
        return { text: hot ? '🔥 这是全站<b>销量前三</b>：' : '🎲 给你挑几件<b>冷门但口碑好</b>的，不容易撞款：', goods: list, chips: ['换成便宜的', '按我的偏好推荐'] };
      }
    },
    {
      id: 'prefer',
      kw: ['按我的偏好', '根据我', '我喜欢什么', '我的口味', '了解我'],
      run: () => {
        const cats = [...new Set([...viewedIds().map((i) => byId(i)?.cat), ...wish().map((i) => byId(i)?.cat)].filter(Boolean))];
        const src = cats.length ? cats : [pick(['户外装备', '数码影音', '生鲜果蔬'])];
        const list = all().filter((p) => src.includes(p.cat) && !cart().some((c) => c.id === p.id))
          .sort((a, b) => b.rating * b.sold - a.rating * a.sold).slice(0, 3);
        const reason = viewedIds().length || wish().length
          ? `根据你<b>浏览过 ${viewedIds().length} 件 / 收藏 ${wish().length} 件</b>，判断你偏 <b>${src.join('、')}</b>${profile.budget ? `，预算 ¥${profile.budget}` : ''}`
          : `你还没留下足迹，我先按<b>大众口味</b>推 ${src.join('、')}`;
        return { text: `🎯 ${reason}\n挑了 3 件最可能中你意的：`, goods: list, chips: ['这些多少钱', '换一批', '我预算 1000'] };
      }
    }
  ];

  /* ---------- 意图打分 ---------- */
  function classify(text) {
    const t = text.toLowerCase();
    let best = null, bestScore = 0;
    for (const it of INTENTS) {
      let s = 0;
      const m = it.rx ? it.rx.exec(text) : null;
      if (m) s += 6;
      (it.kw || []).forEach((k) => { if (t.includes(k.toLowerCase())) s += k.length >= 3 ? 5 : 3; });
      if (s > bestScore) { bestScore = s; best = { it, m: m || (it.rx ? it.rx.exec(text) : null) }; }
    }
    return bestScore >= 3 ? { intent: best.it, match: best.m } : null;
  }

  /* ---------- 生成回复 ---------- */
  function answer(text) {
    const t = text.toLowerCase();
    const scene = detectScene(text);
    if (scene) { profile.scene = scene; }
    const bnum = /(?:预算|控制在|不超过|最多)\s*(\d{2,5})/.exec(text);
    if (bnum) { profile.budget = +bnum[1]; }
    saveProfile();

    const hit = classify(text);
    let res = null;
    if (hit) {
      res = hit.intent.run(text, hit.match || ['', '']);
    }
    if (!res) res = INTENTS.find((i) => i.id === 'search').run(text);   // 兜底：当商品搜索处理
    if (!res || !res.text) {
      res = {
        text: `这个我先老实说：不确定 😅\n我能立刻帮你做的是——<b>按预算配清单</b>、<b>查价格库存</b>、<b>算尺码</b>、<b>凑满减</b>、<b>退换货咨询</b>。\n换个说法再问我一次？`,
        chips: ['预算 500 元推荐', '帮我算尺码', '有什么优惠券']
      };
    }
    if (!res.chips) res.chips = defaultChips();
    return res;
  }
  const defaultChips = () => pick([['按我的偏好推荐', '帮我凑满减', '多久发货'], ['看看热销', '预算 800 元推荐', '转人工']]);

  /* ---------- 渲染 ---------- */
  const body = $('csBody'), chipsBox = $('csChips');

  /* 模型偶尔会用 **加粗**：转成真粗体，别让星号裸奔（只认一对普通星号，不引 Markdown 库） */
  const mdLite = (s) => String(s).replace(/\*\*([^*\n]{1,60})\*\*/g, '<b>$1</b>');

  function goodsHtml(list) {
    if (!list || !list.length) return '';
    /* 注意：拼成单行，避开气泡的 pre-wrap 把换行缩进渲染成空白 */
    return '<div class="cs-goods">' + list.map((p) => `
      <div class="cs-good" data-cs-view="${p.id}">
        <img src="${p.img}" alt="" style="object-position:center ${p.pos}%" />
        <div class="cs-good-info">
          <div class="cs-good-name">${esc(p.name)}</div>
          <div class="cs-good-price">¥${p.price}<del>¥${p.oldPrice}</del></div>
          ${p._why && p._why.length ? `<div class="cs-good-why">${p._why.slice(0, 2).map(esc).join(' · ')}</div>` : ''}
        </div>
        <div class="cs-good-act">
          <button class="cs-mini-btn" data-cs-view="${p.id}">详情</button>
          <button class="cs-mini-btn solid" data-cs-add="${p.id}">加购</button>
        </div>
      </div>`).join('').replace(/\n\s*/g, '') + '</div>';
  }

  /* 思考过程：把后端 trace 摊开给用户看（拆解 → 调工具 → 结果），不参与历史记录 */
  function traceHtml(list) {
    const rows = (list || []).filter((t) => t && t.desc);
    if (!rows.length) return '';
    return `<details class="cs-trace" open>
      <summary>思考过程 · ${rows.length} 步</summary>
      <ol>${rows.map((t) => `<li>${esc(t.desc)}</li>`).join('')}</ol>
    </details>`.replace(/\n\s*/g, '');
  }

  /* 待确认卡：Agent 只能提议写操作，用户点确认后才真正执行 */
  const pendStore = {};
  let pendSeq = 0;
  const money = (n) => (window.Shop && Shop.money ? Shop.money(n) : '￥' + n);

  function pendingHtml(list) {
    if (!list || !list.length) return '';
    return list.slice(0, 2).map((a) => {
      const pid = 'p' + (++pendSeq);
      pendStore[pid] = a;
      if (a.type === 'add_to_cart' || a.type === 'update_cart' || a.type === 'remove_cart') {
        const p = byId(a.id) || {};
        const qty = Math.max(1, Number(a.qty) || 1);
        const price = Number(p.price) || 0;
        const isDel = a.type === 'remove_cart';
        const isUpd = a.type === 'update_cart';
        const hd = isDel ? '待你确认移出' : isUpd ? '待你确认改数量' : '待你确认';
        const tip = isDel
          ? `从购物车移出「${esc(a.spec || '默认规格')}」`
          : `${esc(a.spec || '默认规格')} · 合计 <b>${money(price * qty)}</b>`;
        const okText = isDel ? '确认移出' : isUpd ? '确认改数量' : '确认加入';
        return `<div class="cs-confirm" data-cs-pend="${pid}">
          <div class="cs-confirm-hd">${hd}</div>
          <div class="cs-confirm-row"><span class="cs-confirm-name">${esc(p.name || a.id)}</span>${isDel ? '' : `<b>${money(price)} × ${qty}</b>`}</div>
          <div class="cs-confirm-tip">${tip}</div>
          <div class="cs-confirm-act">
            <button class="cs-mini-btn solid" data-cs-ok="${pid}">${okText}</button>
            <button class="cs-mini-btn" data-cs-no="${pid}">取消</button>
          </div>
        </div>`;
      }
      const n = cart().reduce((s, c) => s + c.qty, 0);
      return `<div class="cs-confirm" data-cs-pend="${pid}">
        <div class="cs-confirm-hd">待你确认下单</div>
        <div class="cs-confirm-row"><span class="cs-confirm-name">购物车 ${n} 件</span><b>${money(cartTotal())}</b></div>
        <div class="cs-confirm-tip">去结算里选地址、确认优惠</div>
        <div class="cs-confirm-act">
          <button class="cs-mini-btn solid" data-cs-ok="${pid}">去结算</button>
          <button class="cs-mini-btn" data-cs-no="${pid}">取消</button>
        </div>
      </div>`;
    }).join('').replace(/\n\s*/g, '');
  }

  /* 确认写操作：先让后端复核（库存/规格/金额），通过后才写本地购物车。
     前端不判断库存、不自己算钱——这是「写操作以后端为准」的落点。 */
  async function confirmPending(pid, btn) {
    const act = pendStore[pid];
    const card = btn.closest('.cs-confirm');
    if (!act || !card) return;
    const hd = card.querySelector('.cs-confirm-hd');
    const tip = card.querySelector('.cs-confirm-tip');
    if (act.type === 'create_order') {
      delete pendStore[pid];
      card.classList.add('is-done');
      hd.textContent = '已转到结算';
      toggle(false); /* 收起抽屉，把订单弹窗让出来 */
      const go = document.querySelector('.js-checkout');
      if (go) go.click(); /* 复用已有结算入口：未登录会先拉起登录 */
      return;
    }
    /* 改数量 / 移出：同样只改本地购物车，但改数量前先让后端复核库存 */
    if (act.type === 'update_cart' || act.type === 'remove_cart') {
      const key = act.id + '|' + (act.spec || '');
      btn.disabled = true;
      btn.textContent = '处理中…';
      if (act.type === 'remove_cart') {
        const done = Shop.removeFromCart ? Shop.removeFromCart(key) : false;
        card.classList.add('is-done');
        hd.textContent = done ? '已移出购物车' : '没找到这件（可能已手动改过）';
        delete pendStore[pid];
        return;
      }
      let data = { ok: false, msg: '网络不太稳，稍后再点一次' };
      try {
        const res = await fetch('/api/cart/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ productId: act.id, spec: act.spec, qty: act.qty }] })
        });
        data = (await res.json().catch(() => null)) || data;
      } catch (err) {
        console.warn('[小峰] 改数量复核失败：', err);
      }
      if (!data.ok) {
        btn.disabled = false;
        btn.textContent = '确认改数量';
        if (tip) tip.textContent = data.msg || '这个数量改不了';
        return;
      }
      const qty = ((data.rows || [])[0] || {}).qty || act.qty;
      const done = Shop.setCartQty ? Shop.setCartQty(key, qty) : false;
      card.classList.add('is-done');
      hd.textContent = done ? ('数量已更新为 ' + qty + ' 件') : '没找到这件（可能已手动改过）';
      delete pendStore[pid];
      return;
    }
    btn.disabled = true;
    btn.textContent = '核对中…';
    let data = { ok: false, msg: '网络不太稳，稍后再点一次' };
    try {
      const res = await fetch('/api/cart/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ productId: act.id, spec: act.spec, qty: act.qty }] })
      });
      data = (await res.json().catch(() => null)) || data;
    } catch (err) {
      console.warn('[小峰] 加购复核失败：', err);
    }
    if (!data.ok) {
      btn.disabled = false;
      btn.textContent = '确认加入';
      tip.textContent = data.msg || '这件现在加不了';
      return;
    }
    const row = (data.rows || [])[0] || {};
    Shop.addToCart(row.productId || act.id, row.spec || act.spec, row.qty || act.qty);
    card.classList.add('is-done');
    hd.textContent = '已加入购物车';
    /* 只报这件的小计：满减是整单一次性抵扣，按单件算会把优惠重复摊进去 */
    tip.innerHTML = '小计 <b>' + money((Number(row.price) || 0) * (Number(row.qty) || 1)) + '</b>';
    delete pendStore[pid];
  }

  function cancelPending(pid, btn) {
    const card = btn.closest('.cs-confirm');
    if (card) {
      card.classList.add('is-done');
      card.querySelector('.cs-confirm-hd').textContent = '已取消';
    }
    delete pendStore[pid];
  }

  /* 存历史时把 <br> 留成换行：否则上一轮的分点回答会粘成一串，模型看不懂自己在说什么 */
  function plainText(html) {
    return String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:div|p|li)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /* head 放在商品卡之前：先看「怎么查的」，再看「找到什么」 */
  function push(role, html, goods, extra, head) {
    record(role, html, goods);
    appendBubble(role, html, goods, extra, head);
  }

  /* 历史压缩：超过阈值就把最旧的几条压成一行摘要，避免 localStorage 与 prompt 一起膨胀 */
  const SUMMARY_AT = 18;
  function compactHistory() {
    if (profile.history.length <= SUMMARY_AT) return;
    const cut = profile.history.length - 12;
    const old = profile.history.slice(0, cut);
    const lines = old.filter((h) => h.role === 'me' && h.html)
      .map((h) => String(h.html).replace(/\s+/g, ' ').slice(0, 36)).filter(Boolean);
    if (lines.length) {
      profile.summary = ((profile.summary ? profile.summary + '；' : '') + lines.slice(-6).join('；')).slice(-320);
    }
    profile.history = profile.history.slice(cut);
  }

  /* 只记历史不上屏：流式回复已经在气泡里了，结束时补记一次即可 */
  function record(role, text, goods) {
    profile.history.push({ role, html: plainText(text), goods: (goods || []).map((g) => g.id) });
    compactHistory();
    saveProfile();
  }

  function appendBubble(role, html, goods, extra, head) {
    const wrap = document.createElement('div');
    wrap.className = 'cs-msg' + (role === 'me' ? ' is-me' : '');
    wrap.innerHTML = `
      ${role === 'me' ? '' : '<span class="cs-face">峰</span>'}
      <div>
        <div class="cs-bubble"><span class="cs-text">${html}</span>${head || ''}${goodsHtml(goods)}${extra || ''}</div>
        <div class="cs-time">${now()}</div>
      </div>`;
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
    return wrap;
  }

  /* 刷新后把本地历史重绘出来：只回显内容，不再发旧的待确认卡（避免重复下单） */
  function restoreHistory() {
    if (body.dataset.restored) return;
    body.dataset.restored = '1';
    (profile.history || []).forEach((m) => {
      const goods = (m.goods || []).map(byId).filter(Boolean);
      appendBubble(m.role === 'me' ? 'me' : 'bot',
        mdLite(esc(m.html || '')).replace(/\n/g, '<br>'), goods);
    });
  }

  /* 流式气泡：文本逐段追加（打字机），工具状态单独一行，结束时补 trace / 商品卡 / 确认卡 */
  function streamBubble() {
    const wrap = appendBubble('bot', '');
    const bubble = wrap.querySelector('.cs-bubble');
    const textEl = bubble.querySelector('.cs-text');
    const caret = document.createElement('span');
    caret.className = 'cs-caret';
    textEl.after(caret);
    const statusEl = document.createElement('div');
    statusEl.className = 'cs-status';
    statusEl.hidden = true;
    wrap.querySelector('.cs-time').before(statusEl);
    let buf = '';
    let sep = false; /* 工具跑完后的第一段文字另起一段 */
    const paint = () => { textEl.innerHTML = mdLite(esc(buf)).replace(/\n/g, '<br>'); };
    return {
      append(t) {
        if (sep && buf) { buf += '\n\n'; sep = false; }
        buf += t;
        paint();
        body.scrollTop = body.scrollHeight;
      },
      replace(t) { buf = t || ''; sep = false; paint(); },
      brk() { sep = true; },
      status(t) { statusEl.hidden = !t; statusEl.textContent = t || ''; },
      finish(goods, pending, trace) {
        caret.remove();
        statusEl.remove();
        bubble.innerHTML = `<span class="cs-text">${mdLite(esc(buf)).replace(/\n/g, '<br>')}</span>`
          + traceHtml(trace) + goodsHtml(goods) + pendingHtml(pending);
        body.scrollTop = body.scrollHeight;
        return buf;
      },
      drop() { wrap.remove(); },
      get text() { return buf; }
    };
  }

  function typing(on) {
    let el = $('csTyping');
    if (on) {
      if (el) return;
      el = document.createElement('div');
      el.className = 'cs-msg'; el.id = 'csTyping';
      el.innerHTML = `<span class="cs-face">峰</span><div class="cs-bubble cs-typing"><i></i><i></i><i></i></div>`;
      body.appendChild(el); body.scrollTop = body.scrollHeight;
    } else if (el) el.remove();
  }

  function setChips(list) {
    chipsBox.innerHTML = (list || []).map((c) => `<button class="cs-chip">${esc(c)}</button>`).join('');
  }

  /* 模型流式回复：气泡先出现，文字边到边渲染；一个字都没吐出来时抛给上层回落规则引擎 */
  async function modelReply(text) {
    const bubble = streamBubble();
    typing(false);
    const res = { goods: [], pending: [], trace: [] };
    let started = false, failed = null, done = false;
    try {
      await askModelStream(text, (evt) => {
        if (!evt || !evt.type) return;
        if (evt.type === 'delta') { started = true; bubble.append(evt.text || ''); }
        else if (evt.type === 'replace') { started = true; bubble.replace(evt.text || ''); }
        else if (evt.type === 'status') bubble.status(evt.text || '');
        else if (evt.type === 'trace') {
          bubble.status((evt.item && evt.item.desc ? evt.item.desc : '') + ' ✓');
          bubble.brk();
        } else if (evt.type === 'done') {
          done = true;
          res.goods = evt.goods || [];
          res.pending = evt.pending || [];
          res.trace = evt.trace || [];
        } else if (evt.type === 'error') {
          failed = new Error(evt.msg || '模型出错');
        }
      });
    } catch (err) {
      failed = failed || err;
    }
    if (failed && !started) { bubble.drop(); throw failed; }
    if (!done) bubble.append('\n\n（说到一半断了，再问我一次？）');
    const finalText = bubble.finish(res.goods, res.pending, res.trace);
    record('bot', finalText, res.goods);
    setChips(defaultChips());
    return finalText;
  }

  async function send(text) {
    const clean = String(text).trim();
    if (!clean) return;
    push('me', esc(clean));
    setChips([]);
    typing(true);
    let res = null;
    /* 降级必须看得见：否则规则话术会被当成模型在回答，自测时根本发现不了故障 */
    let offline = '';
    if (llmEnabled) {
      try {
        await modelReply(clean);
        profile.asks++;
        saveProfile();
        return;
      } catch (err) {
        /* 模型一个字没吐出来：占位气泡已清掉，回落规则引擎，别把客服弄瘫 */
        console.warn('[小峰] 模型流式不可用，回落规则引擎：', err);
        offline = '<div class="cs-offline">离线模式 · 模型暂不可用，已切换本地应答</div>';
        typing(true);
      }
    }
    try {
      res = answer(clean);
    } catch (err) {
      console.error('[小峰] 回答失败：', err);
      res = { text: '刚才我卡了一下下 🙈 麻烦换个说法再问一次？', chips: defaultChips() };
    }
    /* 规则引擎是瞬时的，加一点延迟让“正在输入”有存在感；模型本来就有延迟 */
    await new Promise(r => setTimeout(r, Math.min(1200, 420 + res.text.length * 7)));
    typing(false);
    push('bot', res.text, res.goods,
      (res.extra || '') + pendingHtml(res.pending) + offline, traceHtml(res.trace));
    setChips(res.chips);
    profile.asks++;
    saveProfile();
  }

  /* ---------- 开场白：结合购物车 / 收藏 / 足迹主动说话 ---------- */
  function opening() {
    if (profile.greeted && profile.history.length) {
      const c = cart();
      const n = c.reduce((s, x) => s + x.qty, 0);
      const total = all().length;
      const who = profile.name ? '，<b>' + esc(profile.name) + '</b>' : '';
      let hi = '又见面了' + who + ' 👋\n\n';
      if (n) {
        hi += `购物车里躺着 <b>${n} 件</b>，一共 ¥${cartTotal().toFixed(0)}。\n\n`;
        hi += '现在结掉，还是我帮你看看还差什么？';
      } else if (profile.budget || profile.scene) {
        const bits = [];
        if (profile.scene) bits.push('想搞' + esc(profile.scene));
        if (profile.budget) bits.push('预算 ' + profile.budget + ' 左右');
        hi += '上次你' + bits.join('，') + '。\n\n';
        hi += '接着这个方向看，还是换别的？';
      } else {
        if (total) hi += `店里 ${total} 件货还在。\n\n`;
        hi += '接着上次看的，还是我按你的浏览记录重新挑？';
      }
      push('bot', hi, []);
      setChips(n ? ['帮我凑满减', '去结算'] : ['按我的偏好推荐', '预算 500 元推荐', '新手第一次露营']);
      return;
    }
    const hint = [];
    if (wish().length) hint.push('看到你收藏了 ' + wish().length + ' 件');
    if (viewedIds().length) hint.push('你刚刚翻过 ' + viewedIds().length + ' 件商品');
    const items = all();
    const hot = items.slice().sort((a, b) => (b.sold || 0) - (a.sold || 0))[0];
    let hi = greetWord() + '，我是<b>小峰</b> 🏔️\n\n';
    if (hint.length) hi += hint.join('，') + '。\n\n';
    if (hot) {
      hi += `店里 ${items.length} 件货，卖得最凶的是 <b>${esc(hot.name.split(' ')[0])}</b>，已经出了 ${hot.sold} 单。\n\n`;
    } else if (items.length) {
      hi += `店里 ${items.length} 件货，随便挑。\n\n`;
    }
    hi += '想买什么？丢个关键词，或者给个预算，我帮你挑。';
    push('bot', hi, []);
    setChips(['预算 500 元推荐', '新手第一次露营', '卖得最好的耳机', '有什么优惠券']);
    profile.greeted = true; saveProfile();
  }

  /* ---------- 交互（客服已是独立页面，toggle 改为视图切换） ---------- */
  function ensureInit() { /* 首次进入客服页：先回显本地历史，再决定是接话还是播开场白 */
    if (body.dataset.init) return;
    body.dataset.init = '1';
    restoreHistory();
    opening();
  }
  function toggle(open) {
    if (open) {
      ensureInit();
      if (window.Shop && Shop.switchView) Shop.switchView('service');
    }
  }
  $('csReset').onclick = () => {
    body.innerHTML = ''; profile.history = []; profile.asks = 0; profile.summary = ''; saveProfile();
    opening(); toast2('已开始新对话');
  };
  $('csForm').onsubmit = (e) => { e.preventDefault(); const v = $('csText').value; $('csText').value = ''; send(v); };
  chipsBox.onclick = (e) => { const c = e.target.closest('.cs-chip'); if (c) send(c.textContent); };

  /* 下单成功后由 app.js 广播：把订单号回填进对话。
     这样 Agent 后续说「你那单 SP…」是有出处的，不是编的。 */
  document.addEventListener('shop:order', (e) => {
    const o = (e.detail || {}).order || {};
    if (!o.id) return;
    const n = Number(o.count) || 0;
    const html = `下单成功：订单号 <b>${esc(o.id)}</b>，共 ${n} 件，实付 <b>${money(o.amount)}</b>。`
      + '<br>进度可以在「我的 · 订单」里看，这单的编号我也记住了。';
    /* 客服页还没初始化就先只记历史，否则首次进页时会与回显重复一条 */
    if (!body.dataset.init) record('bot', html, []);
    else push('bot', html, []);
  });

  /* 气泡内的商品操作 */
  body.addEventListener('click', (e) => {
    const ok = e.target.closest('[data-cs-ok]');
    const no = e.target.closest('[data-cs-no]');
    const add = e.target.closest('[data-cs-add]');
    const view = e.target.closest('[data-cs-view]');
    const searchAll = e.target.closest('[data-cs-searchall]');
    if (ok) { confirmPending(ok.dataset.csOk, ok); return; }
    if (no) { cancelPending(no.dataset.csNo, no); return; }
    if (searchAll) {
      const kw = searchAll.dataset.csSearchall;
      if (window.Shop && Shop.searchKeyword) {
        Shop.searchKeyword(kw); // 内部已切回首页并滚动到商品区
      }
      return;
    }
    if (add) {
      const p = byId(add.dataset.csAdd);
      Shop.addToCart(p.id, p.specs[0], 1);
      e.target.textContent = '已加 ✓';
      setTimeout(() => { const n = body.querySelector(`[data-cs-add="${p.id}"]`); if (n) n.textContent = '加购'; }, 1400);
      return; /* 点加购不再连带打开详情 */
    }
    if (view) Shop.openDetail(view.dataset.csView);
  });

  function toast2(msg) { if (window.Shop && Shop.toast) Shop.toast(msg); }

  /* 首次进入：购物车接近满减时轻提醒（不再自动跳页，由用户点进客服页） */
  window.addEventListener('load', () => {
    const pr = promo();
    if (!pr) return;
    const gap = pr.threshold - cartTotal();
    if (gap > 0 && gap <= 160) {
      setTimeout(() => toast2(`购物车再买 ¥${gap.toFixed(0)} 就能减 ${pr.off}，去「客服」页问问小峰怎么凑单～`), 1600);
    }
  });

  /* 暴露给控制台，方便调试 */
  window.PeakAI = { answer, profile, send, toggle, ensureInit };
})();
