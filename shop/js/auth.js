/* ============================================================
   登录 / 注册 与购买拦截（对接 server.py 的 /api 接口）
   对外暴露 window.Auth：
     Auth.isLoggedIn() / Auth.nickname / Auth.profile
     Auth.api(path, body, method)  带 token 的接口请求，供 app.js 订单/地址模块复用
     Auth.openLogin(tab)      打开登录弹窗
     Auth.guard(fn)           已登录执行 fn；未登录记住 fn 并拉起登录，登录成功后自动续跑
     Auth.logout()            退出登录
   ============================================================ */
(function () {
  const TOKEN_KEY = 'sp_token';
  let token = null;
  let nickname = null;
  let profile = { gender: '', city: '' }; // 注册资料，供收货地址预填等场景
  let pending = null; // 登录成功后要继续执行的动作（如下单结算）

  const $ = (id) => document.getElementById(id);

  /* ---------- token 存取：记住我 → localStorage，否则 sessionStorage ---------- */
  function saveToken(tk, remember) {
    token = tk;
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, tk);
  }
  function clearToken() {
    token = null;
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  }
  const storedToken = () => localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);

  /* ---------- 接口调用 ---------- */
  async function api(path, body, method) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    try {
      const res = await fetch(path, { method: method || 'POST', headers, body: body ? JSON.stringify(body) : undefined });
      return await res.json();
    } catch (err) {
      return { ok: false, msg: '连不上服务器，请确认 server.py 已启动' };
    }
  }

  /* ---------- 界面状态 ---------- */
  function updateUI() {
    const btn = $('accountBtn');
    if (btn) {
      if (nickname) {
        btn.textContent = `👤 ${nickname}`;
        btn.classList.add('is-logged');
        btn.title = '点击进入“我的”页';
      } else {
        btn.textContent = '登录/注册';
        btn.classList.remove('is-logged');
        btn.title = '';
      }
    }
    if (window.Shop && Shop.renderMe) Shop.renderMe();
  }

  function openLogin(tab) {
    $('authModal').classList.add('is-open');
    $('authModal').setAttribute('aria-hidden', 'false');
    switchTab(tab || 'login');
    setErr('loginErr', ''); setErr('regErr', '');
    ['lNickname', 'lPassword', 'rNickname', 'rPassword', 'rPassword2'].forEach((id) => { const el = $(id); if (el) el.value = ''; });
    const first = (tab === 'reg' ? $('rNickname') : $('lNickname'));
    if (first) setTimeout(() => first.focus(), 120);
  }
  function closeLogin() {
    if (document.activeElement && $('authModal').contains(document.activeElement)) document.activeElement.blur();
    $('authModal').classList.remove('is-open');
    $('authModal').setAttribute('aria-hidden', 'true');
    pending = null; // 主动关闭则放弃续跑
  }
  function switchTab(name) {
    document.querySelectorAll('#authTabs .m-tab').forEach((b) => b.classList.toggle('is-active', b.dataset.authtab === name));
    document.querySelectorAll('.auth-form').forEach((f) => { f.hidden = f.dataset.authpanel !== name; });
  }
  function setErr(id, msg) { const el = $(id); if (el) el.textContent = msg || ''; }

  /* ---------- 登录成功后的收尾 ---------- */
  function afterAuth(data) {
    token = data.token; nickname = data.nickname;
    profile = { gender: data.gender || '', city: data.city || '' };
    const remember = data.remember;
    saveToken(token, remember === undefined ? true : remember);
    updateUI();
    const fn = pending; pending = null; // 先取出续跑动作，closeLogin 会清空 pending
    closeLogin();
    window.Shop && Shop.toast(`欢迎，${nickname} ❄`);
    if (fn) fn();
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    // 顶栏账号按钮 → “我的”页（登录/退出在页内操作）
    const acc = $('accountBtn');
    if (acc) acc.onclick = () => { if (window.Shop && Shop.switchView) Shop.switchView('me'); };

    // “我的”页内的登录 / 退出按钮
    const mlb = $('meLoginBtn');
    if (mlb) mlb.onclick = () => openLogin();
    const mob = $('meLogoutBtn');
    if (mob) mob.onclick = () => {
      const who = nickname;
      logout().then(() => window.Shop && Shop.toast(`已退出 ${who}`));
    };

    $('authClose').onclick = closeLogin;
    $('authModal').onclick = (e) => { if (e.target === $('authModal')) closeLogin(); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLogin(); });
    $('authTabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-authtab]');
      if (b) switchTab(b.dataset.authtab);
    });

    // 登录
    $('loginForm').onsubmit = async (e) => {
      e.preventDefault();
      setErr('loginErr', '');
      const nicknameVal = $('lNickname').value.trim();
      const password = $('lPassword').value;
      if (!nicknameVal || !password) return setErr('loginErr', '请填写昵称和密码');
      const data = await api('/api/login', { nickname: nicknameVal, password });
      if (!data.ok) return setErr('loginErr', data.msg || '登录失败');
      data.remember = $('lRemember').checked;
      afterAuth(data);
    };

    // 注册
    $('regForm').onsubmit = async (e) => {
      e.preventDefault();
      setErr('regErr', '');
      const nicknameVal = $('rNickname').value.trim();
      const p1 = $('rPassword').value, p2 = $('rPassword2').value;
      if (!/^[0-9A-Za-z_\u4e00-\u9fa5]{2,16}$/.test(nicknameVal)) return setErr('regErr', '昵称需为 2~16 位中文、字母、数字或下划线');
      if (p1.length < 6) return setErr('regErr', '密码至少 6 位');
      if (p1 !== p2) return setErr('regErr', '两次输入的密码不一致');
      const gender = (document.querySelector('input[name="rGender"]:checked') || {}).value || '男';
      const data = await api('/api/register', { nickname: nicknameVal, password: p1, gender, city: $('rCity').value });
      if (!data.ok) return setErr('regErr', data.msg || '注册失败');
      data.remember = true;
      afterAuth(data);
    };
  }

  /* ---------- 退出 ---------- */
  async function logout() {
    if (token) await api('/api/logout', null);
    clearToken();
    nickname = null;
    profile = { gender: '', city: '' };
    updateUI();
  }

  /* ---------- 对外接口 ---------- */
  window.Auth = {
    isLoggedIn: () => !!nickname,
    get nickname() { return nickname; },
    get profile() { return { ...profile }; },
    api,          // 带 token 的接口请求：Auth.api(path, body, method)，供 app.js 订单/地址模块复用
    openLogin,
    closeLogin,
    logout,
    guard(fn) {
      if (this.isLoggedIn()) return fn();
      pending = fn;
      openLogin('login');
      window.Shop && Shop.toast('请先登录后再下单');
      return false;
    }
  };

  /* ---------- 启动：恢复既有会话 ---------- */
  (async function init() {
    bind();
    const saved = storedToken();
    if (saved) {
      token = saved;
      const data = await api('/api/me', null, 'GET');
      if (data.ok) { nickname = data.nickname; profile = { gender: data.gender || '', city: data.city || '' }; }
      else clearToken();
    }
    updateUI();
  })();
})();
