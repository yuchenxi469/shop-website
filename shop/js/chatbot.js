/* ============================================================
   小峰 · AI 导购（纯前端实现）
   个性化依据：昵称 / 预算 / 使用场景 / 浏览足迹 / 购物车 / 收藏夹 / 历史对话
   依赖 app.js 暴露的 window.Shop 接口
   ============================================================ */
(function () {
  'use strict';

  const IMG = 'assets/mountain.jpg';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- 用户画像（本地持久化） ---------- */
  const profile = Object.assign(
    { name: '', budget: null, scene: '', level: '', history: [], asks: 0, greeted: false },
    JSON.parse(localStorage.getItem('sp_profile') || '{}')
  );
  const saveProfile = () => localStorage.setItem('sp_profile', JSON.stringify(profile));

  const all = () => (window.Shop ? Shop.products : []);
  const cart = () => (Shop.state ? Shop.state.cart : []);
  const wish = () => (Shop.state ? Shop.state.wish : []);
  const viewedIds = () => Shop.viewed();
  const byId = (id) => all().find((p) => p.id === id);
  const cartTotal = () => cart().reduce((s, c) => s + c.price * c.qty, 0);

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

  /* 场景 / 人群标签，用于个性化措辞 */
  const SCENES = [
    { key: '露营', words: ['露营', '野营', '营地', '扎营'] },
    { key: '徒步', words: ['徒步', '登山', '爬山', '穿越', '长线'] },
    { key: '摄影', words: ['摄影', '拍照', '航拍', '镜头', '出片'] },
    { key: '自驾', words: ['自驾', '开车', '后备箱'] },
    { key: '家用', words: ['家里', '客厅', '卧室', '日常', '通勤'] }
  ];
  const detectScene = (t) => SCENES.find((s) => s.words.some((w) => t.includes(w)))?.key || '';

  /* ---------- 推荐引擎：命中商品 + 预算 + 足迹同类加权 ---------- */
  function recommend(text, opts = {}) {
    const hits = matchProducts(text);
    const budget = opts.budget || profile.budget;
    const viewedCats = viewedIds().map((id) => byId(id)?.cat).filter(Boolean);
    let list = hits.length ? hits.slice() : all().slice();

    list = list.map((p) => {
      let s = p.rating * 6 + Math.log10(p.sold + 10) * 4 + (p.hot ? 8 : 0);
      if (budget && p.price <= budget) s += 26;
      if (budget && p.price > budget * 1.35) s -= 40;
      if (viewedCats.includes(p.cat)) s += 9;
      if (wish().includes(p.id)) s += 12;
      if (cart().some((c) => c.id === p.id)) s -= 30;      // 已买过的不再重复推
      if (detectScene(text) === '露营' && p.cat === '户外装备') s += 10;
      if (detectScene(text) === '摄影' && p.cat === '摄影器材') s += 10;
      return { p, s };
    });
    list.sort((a, b) => b.s - a.s);
    return list.slice(0, opts.limit || 3).map((x) => x.p);
  }

  /* ---------- 意图库 ---------- */
  const INTENTS = [
    {
      id: 'greeting',
      kw: ['你好', '在吗', 'hi', 'hello', '嗨', '哈喽'],
      run: (t) => ({
        text: `${greetWord()}${profile.name ? '，' + esc(profile.name) : ''}！我是小峰 🏔️\n\n${pick([
          '告诉我<b>预算</b>和<b>使用场景</b>，我可以直接给你搭一套清单。',
          '不管是第一次露营还是老手升级装备，我都能给你挑到合适的。'
        ])}\n比如：「预算 800 元，第一次露营买什么？」`,
        chips: ['预算 500 元推荐', '新手第一次露营', '有什么优惠券']
      })
    },
    {
      id: 'identity',
      kw: ['你是谁', '你叫什么', '机器人', '是 ai', '人工智能', '真人吗'],
      run: () => ({
        text: `我是<b>小峰</b>，雪峰优选的 AI 导购 🤖\n我读得到你的<b>浏览足迹、购物车和收藏夹</b>，所以推荐会跟着你的偏好走；也可以记住你的预算和常玩的场景。\n（演示站点，规则引擎驱动，不接入真实大模型）`,
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
        const list = recommend(t, { budget });
        const sum = list.reduce((s, p) => s + p.price, 0);
        const sceneWord = detectScene(t) || profile.scene || '户外';
        return {
          text: `收到${you()}预算 <b>¥${budget}</b> 的${sceneWord}装备。\n按<b>评分 + 销量 + 是否超价</b>给你挑了 ${list.length} 件，合计 ¥${sum.toFixed(0)}${sum <= budget ? '，正好在预算内 ✅' : '，稍微超了一点，可以先拿下前两件'}：`,
          goods: list,
          chips: ['再换一批', '把这些加入购物车', '有没有更便宜的']
        };
      }
    },
    {
      id: 'search',
      kw: [],
      run: (t) => {
        if (!matchProducts(t).length) return null;                 // 没命中商品就交给兼容回答
        const list = recommend(t, { limit: 3 });
        const cats = [...new Set(list.map((p) => p.cat))];
        return {
          text: `${you()}我按「<b>${esc(t.slice(0, 12))}</b>」在 ${cats.join(' / ')} 里找到这几件最贴合的：`,
          goods: list,
          chips: ['这件有货吗', '有没有优惠', '帮我对比一下']
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
        const total = cartTotal();
        const gap = 499 - total;
        let text = `当前活动：<b>满 499 减 50</b>、全场包邮、下单送 300 积分。\n`;
        if (total > 0 && gap > 0) {
          const add = recommend('户外装备', { budget: gap + 20, limit: 2 }).filter((p) => p.price <= gap + 5);
          text += `${you()}购物车已有 ¥${total.toFixed(0)}，<b>再凑 ¥${gap.toFixed(0)}</b> 就能减 50 —— 相当于打 ${((1 - 50 / 499) * 10).toFixed(1)} 折。这两件刚好补上：`;
          return { text, goods: add.length ? add : recommend('家居生活', { budget: gap, limit: 2 }), chips: ['去结算', '换一批凑单品'] };
        }
        if (total >= 499) text += `你的购物车已经 ¥${total.toFixed(0)}，<b>满减已达成</b>，直接结算就能减 50 🎉`;
        else text += `购物车还空着，先挑两件？告诉我预算和场景，我来配清单。`;
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
        if (hits.length < 2) return { text: `想对比哪两件？说出两个名字就行，比如「帐篷和睡袋哪个先买」。`, chips: ['新手先买什么'] };
        const [a, b] = hits;
        const cheaper = a.price < b.price ? a : b, better = a.rating > b.rating ? a : b;
        return {
          text: `🆚 <b>${a.name}</b> vs <b>${b.name}</b>\n· 价格：¥${a.price} / ¥${b.price}\n· 评分：${a.rating} / ${b.rating}\n· 销量：${a.sold} / ${b.sold}\n· 规格：${a.specs.join('/')} ｜ ${b.specs.join('/')}\n\n我的判断：<b>${cheaper.id}</b> 更省钱，<b>${better.id}</b> 口碑更好。${profile.budget ? `以你 ¥${profile.budget} 的预算来说，${cheaper.price <= profile.budget ? '选更便宜的这件压力更小' : '两件都超预算了，建议先买一件'}。` : '如果你告诉我使用场景，我能给更准的建议。'}`,
          goods: hits, chips: ['把更便宜的加购', '我预算 800']
        };
      }
    },
    {
      id: 'newbie',
      kw: ['新手', '第一次', '小白', '入门', '怎么开始', '先买什么', '清单'],
      run: (t) => {
        const scene = detectScene(t) || '露营';
        profile.scene = scene; saveProfile();
        const cat = scene === '摄影' ? '摄影器材' : scene === '家用' ? '家居生活' : '户外装备';
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
        const gap = 499 - total;
        const sum = c.map((x) => `· ${x.name.slice(0, 14)}…（${x.spec}）×${x.qty} = ¥${(x.price * x.qty).toFixed(0)}`).join('\n');
        let text = `🛒 你的购物车（${c.reduce((s, x) => s + x.qty, 0)} 件）\n${sum}\n\n合计 <b>¥${total.toFixed(0)}</b>${gap > 0 ? `，再买 ¥${gap.toFixed(0)} 可减 50（等于省 ${(50 / gap * 100).toFixed(0)}%）` : '，<b>满减已达成</b>，可减 50 🎉'}`;
        if (/加购|下单|结算|去支付|打开购物车/.test(t)) { Shop.openCart(true); toggle(false); text += '\n已经帮你打开购物车（客服先收起），点「去结算」即可～'; }
        return { text, chips: gap > 0 ? ['帮我凑单', '打开购物车'] : ['去结算', '再推荐点别的'] };
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
      kw: ['更便宜', '便宜点', '再低', '少点', '平价替代', '划算'],
      run: (t) => {
        const base = profile.budget || cartTotal() || 600;
        const list = all().filter((p) => p.price <= base * 0.75).sort((a, b) => b.rating - a.rating).slice(0, 3);
        return {
          text: `💡 按「不超过 ¥${(base * 0.75).toFixed(0)}」重挑了一轮，都是<b>评分优先</b>的实惠款：\n（提示：把价格区间筛到 0-${(base * 0.75).toFixed(0)} 也能自己扫一遍）`,
          goods: list, chips: ['就这个价了', '帮我凑满减']
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
        const src = cats.length ? cats : [pick(['户外装备', '摄影器材', '家居生活'])];
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

  function goodsHtml(list) {
    if (!list || !list.length) return '';
    /* 注意：拼成单行，避开气泡的 pre-wrap 把换行缩进渲染成空白 */
    return '<div class="cs-goods">' + list.map((p) => `
      <div class="cs-good">
        <img src="${IMG}" alt="" style="object-position:center ${p.pos}%" />
        <div class="cs-good-info">
          <div class="cs-good-name">${esc(p.name)}</div>
          <div class="cs-good-price">¥${p.price}<del>¥${p.oldPrice}</del></div>
        </div>
        <div class="cs-good-act">
          <button class="cs-mini-btn" data-cs-view="${p.id}">详情</button>
          <button class="cs-mini-btn solid" data-cs-add="${p.id}">加购</button>
        </div>
      </div>`).join('').replace(/\n\s*/g, '') + '</div>';
  }

  function push(role, html, goods) {
    profile.history.push({ role, html: html.replace(/<[^>]+>/g, ''), goods: (goods || []).map((g) => g.id) });
    if (profile.history.length > 30) profile.history = profile.history.slice(-30);
    saveProfile();
    const wrap = document.createElement('div');
    wrap.className = 'cs-msg' + (role === 'me' ? ' is-me' : '');
    wrap.innerHTML = `
      ${role === 'me' ? '' : '<span class="cs-face">峰</span>'}
      <div>
        <div class="cs-bubble"><span class="cs-text">${html}</span>${goodsHtml(goods)}</div>
        <div class="cs-time">${now()}</div>
      </div>`;
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
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

  function send(text) {
    const clean = String(text).trim();
    if (!clean) return;
    push('me', esc(clean));
    setChips([]);
    typing(true);
    let res;
    try {
      res = answer(clean);
    } catch (err) {
      console.error('[小峰] 回答失败：', err);
      res = { text: '刚才我卡了一下下 🙈 麻烦换个说法再问一次？', chips: defaultChips() };
    }
    profile.asks++;
    const delay = Math.min(1500, 420 + res.text.length * 7);
    setTimeout(() => {
      typing(false);
      push('bot', res.text, res.goods);
      setChips(res.chips);
      saveProfile();
    }, delay);
  }

  /* ---------- 开场白：结合购物车 / 收藏 / 足迹主动说话 ---------- */
  function opening() {
    if (profile.greeted && profile.history.length) {
      const c = cart();
      let hi = '又见面啦' + (profile.name ? '，<b>' + esc(profile.name) + '</b>' : '') + ' 👋\n';
      if (c.length) {
        hi += '购物车里还留着 <b>' + c.reduce((s, x) => s + x.qty, 0) + ' 件</b>（¥' + cartTotal().toFixed(0) + '），要现在结算吗？还是我帮你凑满减？';
      } else {
        hi += '上次你' + (profile.budget ? '提到预算 ¥' + profile.budget : '还没说过预算') + (profile.scene ? '，想玩' + profile.scene : '') + '。这次想看点什么？';
      }
      push('bot', hi, []);
      setChips(c.length ? ['帮我凑满减', '去结算'] : ['按我的偏好推荐', '预算 500 元推荐', '新手第一次露营']);
      return;
    }
    const hint = [];
    if (wish().length) hint.push('看到你收藏了 ' + wish().length + ' 件');
    if (viewedIds().length) hint.push('你刚刚翻过 ' + viewedIds().length + ' 件商品');
    let hi = greetWord() + '！我是<b>小峰</b>，雪峰优选的 AI 导购 🏔️\n';
    hi += hint.length
      ? hint.join('，') + '，要不要我接着往下配？\n'
      : '我知道你的浏览、收藏和购物车，所以推荐不会瞎推。\n';
    hi += '先说说：想解决什么问题？（预算 / 场景 / 商品名都行）';
    push('bot', hi, []);
    setChips(['新手第一次露营', '预算 500 元推荐', '有什么优惠券', '帮我算尺码']);
    profile.greeted = true; saveProfile();
  }

  /* ---------- 交互 ---------- */
  const panel = $('csPanel'), launcher = $('csLauncher');
  function toggle(open) {
    panel.classList.toggle('is-open', open);
    launcher.classList.toggle('is-hidden', open);
    $('csDot').classList.toggle('is-off', open);
    panel.setAttribute('aria-hidden', String(!open));
    if (open) {
      if (!body.dataset.init) { body.dataset.init = '1'; opening(); }
      setTimeout(() => $('csText').focus(), 260);
    }
  }
  launcher.onclick = () => toggle(true);
  $('csClose').onclick = () => toggle(false);
  $('csReset').onclick = () => {
    body.innerHTML = ''; profile.history = []; profile.asks = 0; saveProfile();
    opening(); toast2('已开始新对话');
  };
  $('csForm').onsubmit = (e) => { e.preventDefault(); const v = $('csText').value; $('csText').value = ''; send(v); };
  chipsBox.onclick = (e) => { const c = e.target.closest('.cs-chip'); if (c) send(c.textContent); };

  /* 气泡内的商品操作 */
  body.addEventListener('click', (e) => {
    const add = e.target.closest('[data-cs-add]');
    const view = e.target.closest('[data-cs-view]');
    if (add) {
      const p = byId(add.dataset.csAdd);
      Shop.addToCart(p.id, p.specs[0], 1);
      e.target.textContent = '已加 ✓';
      setTimeout(() => { const n = body.querySelector(`[data-cs-add="${p.id}"]`); if (n) n.textContent = '加购'; }, 1400);
    }
    if (view) Shop.openDetail(view.dataset.csView);
  });

  function toast2(msg) { if (window.Shop && Shop.toast) Shop.toast(msg); }

  /* 首次进入：3 秒后红点提示；购物车接近满减时主动提醒一次 */
  setTimeout(() => { $('csDot').classList.remove('is-off'); }, 2600);
  window.addEventListener('load', () => {
    const total = cartTotal(), gap = 499 - total;
    if (gap > 0 && gap <= 160) {
      setTimeout(() => {
        toggle(true);
        setTimeout(() => send('帮我凑满减'), 500);
      }, 1200);
    }
  });

  /* 暴露给控制台，方便调试 */
  window.PeakAI = { answer, profile, send, toggle };
})();
