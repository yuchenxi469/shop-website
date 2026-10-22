#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
雪峰优选 · 商城后端（学习演示用）
纯 Python 标准库实现，无需安装任何依赖。

功能：
  1. 静态服务：托管整个 shop/ 目录（等同于原来的 python3 -m http.server）
  2. 认证 API：
       POST /api/register  注册（昵称/密码/性别/城市），成功即登录，返回 token
       POST /api/login     登录，返回 token
       POST /api/logout    退出登录（使 token 失效）
       GET  /api/me        校验 token，返回当前用户
       PATCH /api/profile  修改性别/城市
  3. 商品 API（公开）：
       GET  /api/products        商品列表（data/products.json），支持 ?q=&category=&min=&max=&sort=sales|price_asc|price_desc|rating&page=&pageSize=
       GET  /api/products/<id>   商品详情
  4. 订单 API（需登录，价格由服务端重算）：
       POST  /api/orders                  下单（clientOrderId 幂等）
       GET   /api/orders                  我的订单列表
       GET   /api/orders/<id>             订单详情（含物流轨迹）
       POST  /api/orders/<id>/advance     模拟物流推进一档
       POST  /api/orders/<id>/cancel      取消（仅待发货可取消）
  5. 地址簿 API（需登录，每人最多 10 条，默认地址唯一）：
       GET/POST /api/addresses    PUT/DELETE /api/addresses/<id>

安全说明（演示级）：
  - 密码使用 PBKDF2-HMAC-SHA256 + 随机盐 哈希存储，不落明文
  - token 会话落盘 data/sessions.json，有效期 7 天，重启不掉线
  - 仅适合本地学习演示，正式项目请使用 HTTPS + 成熟框架

启动：python3 server.py   （默认 http://127.0.0.1:8123）
"""
import hashlib
import hmac
import json
import random
import re
import secrets
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

BASE = Path(__file__).resolve().parent          # shop/ 目录
DATA_FILE = BASE / "data" / "users.json"        # 用户数据（哈希后存储）
PRODUCTS_FILE = BASE / "data" / "products.json" # 商品数据
SESSIONS_FILE = BASE / "data" / "sessions.json" # 会话落盘（重启不掉线）
ORDERS_FILE = BASE / "data" / "orders.json"     # 订单数据
ADDRS_FILE = BASE / "data" / "addresses.json"   # 收货地址簿
PORT = 8123
SESSION_TTL = 7 * 24 * 3600                     # 会话有效期：7 天
PBKDF2_ROUNDS = 120_000
MAX_ADDRS = 10                                  # 单用户地址上限

_lock = threading.RLock()                       # 保护会话与数据文件读写（可重入）
_sessions = {}                                  # token -> {"nickname": str, "expires": float}

NICKNAME_RE = re.compile(r"^[\w\u4e00-\u9fa5]{2,16}$")  # 2~16 位中文/字母/数字/下划线
MAX_LOGIN_FAILS = 5          # 同一昵称连续错 5 次即锁定
LOGIN_LOCK_SECONDS = 600     # 锁 10 分钟，防密码爆破
_login_fails = {}            # nickname -> {"count": int, "locked_until": float}


def login_locked_seconds(nickname):
    """返回剩余锁定秒数；0 表示未被锁定"""
    with _lock:
        rec = _login_fails.get(nickname)
        if not rec:
            return 0
        until = rec.get("locked_until", 0)
        if until > time.time():
            return int(until - time.time()) + 1
        if until:
            _login_fails.pop(nickname)  # 锁定期满解除
    return 0


def login_failed(nickname):
    with _lock:
        rec = _login_fails.setdefault(nickname, {"count": 0})
        rec["count"] += 1
        if rec["count"] >= MAX_LOGIN_FAILS:
            rec["locked_until"] = time.time() + LOGIN_LOCK_SECONDS
            rec["count"] = 0


def login_succeeded(nickname):
    with _lock:
        _login_fails.pop(nickname, None)


# ---------------- 用户存储 ----------------
def load_json_file(path, default):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return default
    return default


def save_json_file(path, obj):
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def load_users():
    return load_json_file(DATA_FILE, {})


def save_users(users):
    save_json_file(DATA_FILE, users)


def hash_password(password, salt_hex=None):
    """PBKDF2 加盐哈希。返回 (salt_hex, hash_hex)。"""
    salt_hex = salt_hex or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), PBKDF2_ROUNDS
    ).hex()
    return salt_hex, digest


# ---------------- 会话（落盘持久化，重启不掉线） ----------------
def load_sessions():
    global _sessions
    raw = load_json_file(SESSIONS_FILE, {})
    now = time.time()
    _sessions = {k: v for k, v in raw.items() if isinstance(v, dict) and v.get("expires", 0) > now}


def persist_sessions():
    save_json_file(SESSIONS_FILE, _sessions)


def create_session(nickname):
    token = secrets.token_hex(24)
    with _lock:
        _sessions[token] = {"nickname": nickname, "expires": time.time() + SESSION_TTL}
        persist_sessions()
    return token


def get_session(token):
    with _lock:
        s = _sessions.get(token)
        if s and s["expires"] > time.time():
            return s
        if token in _sessions:
            _sessions.pop(token)
            persist_sessions()
    return None


# ---------------- HTTP 处理 ----------------
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE), **kwargs)

    # ---- 工具 ----
    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except Exception:
            return None

    def bearer_token(self):
        auth = self.headers.get("Authorization", "")
        return auth[7:].strip() if auth.startswith("Bearer ") else None

    def require_auth(self):
        """返回当前用户昵称；未登录时已发送 401 响应，返回 None"""
        s = get_session(self.bearer_token())
        if not s:
            self.send_json(401, {"ok": False, "msg": "登录已失效，请重新登录"})
            return None
        return s["nickname"]

    # ---- 路由 ----
    def do_GET(self):
        p = self.path.split("?")[0].rstrip("/")
        # 安全：禁止通过静态服务拉取业务数据文件与后端源码
        if p == "/data" or p.startswith("/data/") or p.endswith(".py"):
            return self.send_json(404, {"ok": False, "msg": "未找到"})
        if p == "/api/me":
            return self.api_me()
        if p == "/api/products":
            return self.api_products()
        if p.startswith("/api/products/"):
            return self.api_product_detail(p.rsplit("/", 1)[-1])
        if p == "/api/orders":
            return self.api_orders_list()
        if p.startswith("/api/orders/"):
            return self.api_order_detail(p.split("/")[3])
        if p == "/api/addresses":
            return self.api_addresses_list()
        return super().do_GET()  # 其余路径走静态文件

    def do_HEAD(self):
        p = self.path.split("?")[0].rstrip("/")
        if p == "/data" or p.startswith("/data/") or p.endswith(".py"):
            self.send_response(404)
            self.end_headers()
            return
        return super().do_HEAD()

    def do_POST(self):
        p = self.path.split("?")[0].rstrip("/")
        if p.startswith("/api/register"):
            return self.api_register()
        if p.startswith("/api/login"):
            return self.api_login()
        if p.startswith("/api/logout"):
            return self.api_logout()
        if p == "/api/orders":
            return self.api_orders_create()
        parts = p.split("/")  # ['', 'api', 'orders', <id>, <action>]
        if len(parts) == 5 and parts[1] == "api" and parts[2] == "orders":
            if parts[4] == "advance":
                return self.api_orders_advance(parts[3])
            if parts[4] == "cancel":
                return self.api_orders_cancel(parts[3])
        if p == "/api/addresses":
            return self.api_addresses_add()
        self.send_json(404, {"ok": False, "msg": "接口不存在"})

    def do_PUT(self):
        p = self.path.split("?")[0].rstrip("/")
        parts = p.split("/")
        if len(parts) == 4 and parts[1] == "api" and parts[2] == "addresses":
            return self.api_addresses_update(parts[3])
        self.send_json(404, {"ok": False, "msg": "接口不存在"})

    def do_DELETE(self):
        p = self.path.split("?")[0].rstrip("/")
        parts = p.split("/")
        if len(parts) == 4 and parts[1] == "api" and parts[2] == "addresses":
            return self.api_addresses_delete(parts[3])
        self.send_json(404, {"ok": False, "msg": "接口不存在"})

    def do_PATCH(self):
        p = self.path.split("?")[0].rstrip("/")
        if p == "/api/profile":
            return self.api_profile_update()
        self.send_json(404, {"ok": False, "msg": "接口不存在"})

    # ---- 接口实现 ----
    def api_register(self):
        data = self.read_json()
        if data is None:
            return self.send_json(400, {"ok": False, "msg": "请求格式错误"})
        nickname = str(data.get("nickname", "")).strip()
        password = str(data.get("password", ""))
        gender = str(data.get("gender", "")).strip() or "未填写"
        city = str(data.get("city", "")).strip() or "未填写"

        if not NICKNAME_RE.match(nickname):
            return self.send_json(400, {"ok": False, "msg": "昵称需为 2~16 位中文、字母、数字或下划线"})
        if len(password) < 6:
            return self.send_json(400, {"ok": False, "msg": "密码至少 6 位"})

        with _lock:
            users = load_users()
            if nickname in users:
                return self.send_json(409, {"ok": False, "msg": "该昵称已被注册，请换一个或直接登录"})
            salt, digest = hash_password(password)
            users[nickname] = {
                "salt": salt,
                "password": digest,
                "gender": gender,
                "city": city,
                "created": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
            save_users(users)

        # 注册成功即登录（一并返回资料，供前端预填收货地址等场景使用）
        token = create_session(nickname)
        self.send_json(200, {"ok": True, "token": token, "nickname": nickname,
                             "gender": gender, "city": city, "msg": "注册成功，已自动登录"})

    def api_login(self):
        data = self.read_json()
        if data is None:
            return self.send_json(400, {"ok": False, "msg": "请求格式错误"})
        nickname = str(data.get("nickname", "")).strip()
        password = str(data.get("password", ""))

        # 防爆破：同一昵称连续失败达上限后暂时锁定
        secs = login_locked_seconds(nickname)
        if secs:
            return self.send_json(429, {"ok": False, "msg": f"失败次数过多，账号已临时锁定，请 {secs} 秒后重试"})

        users = load_users()
        record = users.get(nickname)
        # 统一文案：不区分“昵称不存在/密码错误”，防用户枚举
        if not record:
            login_failed(nickname)
            return self.send_json(401, {"ok": False, "msg": "昵称或密码错误"})
        _, digest = hash_password(password, record["salt"])
        if not hmac.compare_digest(digest, record["password"]):
            login_failed(nickname)
            return self.send_json(401, {"ok": False, "msg": "昵称或密码错误"})

        login_succeeded(nickname)
        token = create_session(nickname)
        self.send_json(200, {"ok": True, "token": token, "nickname": nickname,
                             "gender": record.get("gender", "未填写"), "city": record.get("city", "未填写"),
                             "msg": "登录成功"})

    def api_logout(self):
        token = self.bearer_token()
        with _lock:
            _sessions.pop(token, None)
        self.send_json(200, {"ok": True, "msg": "已退出登录"})

    def api_me(self):
        s = get_session(self.bearer_token())
        if not s:
            return self.send_json(401, {"ok": False, "msg": "登录已失效，请重新登录"})
        record = load_users().get(s["nickname"], {})
        self.send_json(200, {"ok": True, "nickname": s["nickname"],
                             "gender": record.get("gender", "未填写"), "city": record.get("city", "未填写")})

    def api_profile_update(self):
        nickname = self.require_auth()
        if not nickname:
            return
        data = self.read_json() or {}
        with _lock:
            users = load_users()
            rec = users.get(nickname)
            if not rec:
                return self.send_json(404, {"ok": False, "msg": "用户不存在"})
            if "gender" in data:
                rec["gender"] = str(data["gender"]).strip() or "未填写"
            if "city" in data:
                rec["city"] = str(data["city"]).strip() or "未填写"
            save_users(users)
        self.send_json(200, {"ok": True, "msg": "资料已更新", "nickname": nickname,
                             "gender": rec["gender"], "city": rec["city"]})

    # ---- 商品 ----
    def api_products(self):
        """GET /api/products 支持查询参数（均选填，不传时返回全量，与前端旧调用完全兼容）：
           q        关键词，不区分大小写匹配 名称/副标题/分类
           category 分类精确匹配（如：户外装备）
           min/max  价格区间
           sort     sales销量降序 | price_asc | price_desc | rating评分降序
           page/pageSize 分页（从 1 开始，pageSize 上限 100；传了才生效）"""
        qs = parse_qs(urlparse(self.path).query)

        def arg(name, default=""):
            return (qs.get(name) or [default])[0].strip()

        products = load_json_file(PRODUCTS_FILE, [])
        result = products

        q = arg("q").lower()
        if q:
            result = [p for p in result
                      if q in (str(p.get("name", "")) + str(p.get("sub", "")) + str(p.get("cat", ""))).lower()]
        cat = arg("category")
        if cat:
            result = [p for p in result if p.get("cat") == cat]
        try:
            lo = float(arg("min")) if arg("min") else None
            hi = float(arg("max")) if arg("max") else None
        except ValueError:
            lo = hi = None
        if lo is not None:
            result = [p for p in result if p.get("price", 0) >= lo]
        if hi is not None:
            result = [p for p in result if p.get("price", 0) <= hi]

        sort = arg("sort")
        if sort == "sales":
            result = sorted(result, key=lambda p: p.get("sold", 0), reverse=True)
        elif sort == "price_asc":
            result = sorted(result, key=lambda p: p.get("price", 0))
        elif sort == "price_desc":
            result = sorted(result, key=lambda p: p.get("price", 0), reverse=True)
        elif sort == "rating":
            result = sorted(result, key=lambda p: p.get("rating", 0), reverse=True)

        resp = {"ok": True, "products": result, "total": len(result)}
        page_raw, size_raw = arg("page"), arg("pageSize")
        if page_raw or size_raw:
            try:
                page = max(int(page_raw or 1), 1)
            except ValueError:
                page = 1
            try:
                size = min(max(int(size_raw or 12), 1), 100)
            except ValueError:
                size = 12
            start = (page - 1) * size
            resp["products"] = result[start:start + size]
            resp["page"], resp["pageSize"] = page, size
        self.send_json(200, resp)

    def api_product_detail(self, pid):
        p = next((x for x in load_json_file(PRODUCTS_FILE, []) if x.get("id") == pid), None)
        if not p:
            return self.send_json(404, {"ok": False, "msg": "商品不存在"})
        self.send_json(200, {"ok": True, "product": p})

    # ---- 订单 ----
    def api_orders_list(self):
        nickname = self.require_auth()
        if not nickname:
            return
        orders = [o for o in load_json_file(ORDERS_FILE, []) if o.get("nickname") == nickname]
        self.send_json(200, {"ok": True, "orders": orders})

    def api_order_detail(self, oid):
        nickname = self.require_auth()
        if not nickname:
            return
        o = next((x for x in load_json_file(ORDERS_FILE, []) if x.get("id") == oid), None)
        if not o:
            return self.send_json(404, {"ok": False, "msg": "订单不存在"})
        if o.get("nickname") != nickname:
            return self.send_json(403, {"ok": False, "msg": "无权查看他人订单"})
        self.send_json(200, {"ok": True, "order": o})

    def api_orders_create(self):
        nickname = self.require_auth()
        if not nickname:
            return
        data = self.read_json()
        if data is None:
            return self.send_json(400, {"ok": False, "msg": "请求格式错误"})
        items = data.get("items") or []
        addr = data.get("addr") or {}
        client_oid = str(data.get("clientOrderId") or "")[:64]
        if not items:
            return self.send_json(422, {"ok": False, "msg": "购物车是空的"})
        err = check_addr(addr)
        if err:
            return self.send_json(400, {"ok": False, "msg": err})
        pmap = {p["id"]: p for p in load_json_file(PRODUCTS_FILE, [])}
        rows, subtotal = [], 0.0
        for it in items[:60]:
            p = pmap.get(str(it.get("productId", "")))
            if not p:
                return self.send_json(422, {"ok": False, "msg": "商品不存在或已下架"})
            try:
                qty = int(it.get("qty", 0))
            except (TypeError, ValueError):
                qty = 0
            if qty < 1 or qty > 99:
                return self.send_json(422, {"ok": False, "msg": "商品数量需在 1~99 之间"})
            rows.append({"productId": p["id"], "name": p["name"], "spec": str(it.get("spec", "")),
                         "qty": qty, "price": p["price"], "img": p["img"]})
            subtotal += p["price"] * qty
        with _lock:
            orders = load_json_file(ORDERS_FILE, [])
            # 幂等：同一用户相同 clientOrderId 直接返回已存在的单
            if client_oid:
                for o in orders:
                    if o.get("nickname") == nickname and o.get("clientOrderId") == client_oid:
                        return self.send_json(200, {"ok": True, "order": o, "msg": "订单已存在（幂等返回）"})
            discount = 50 if subtotal >= 499 else 0
            order = {
                "id": "SP" + time.strftime("%y%m%d%H%M%S") + "%03d" % random.randrange(1000),
                "clientOrderId": client_oid,
                "nickname": nickname,
                "time": int(time.time() * 1000),
                "items": rows,
                "count": sum(r["qty"] for r in rows),
                "subtotal": round(subtotal, 2),
                "discount": discount,
                "amount": round(subtotal - discount, 2),
                "addr": {k: str(addr.get(k, "")).strip() for k in ("name", "phone", "prov", "city", "detail")},
                "stage": 0,
            }
            order["traces"] = build_traces(order)
            orders.insert(0, order)
            save_json_file(ORDERS_FILE, orders)
        if data.get("saveAddr"):
            save_addr_from_order(nickname, order["addr"])
        self.send_json(200, {"ok": True, "order": order, "msg": "下单成功"})

    def api_orders_advance(self, oid):
        nickname = self.require_auth()
        if not nickname:
            return
        with _lock:
            orders = load_json_file(ORDERS_FILE, [])
            o = next((x for x in orders if x.get("id") == oid), None)
            if not o:
                return self.send_json(404, {"ok": False, "msg": "订单不存在"})
            if o.get("nickname") != nickname:
                return self.send_json(403, {"ok": False, "msg": "无权操作他人订单"})
            if o["stage"] < 0:
                return self.send_json(422, {"ok": False, "msg": "订单已取消"})
            if o["stage"] >= 5:
                return self.send_json(422, {"ok": False, "msg": "订单已签收，无需推进"})
            o["stage"] += 1
            save_json_file(ORDERS_FILE, orders)
        self.send_json(200, {"ok": True, "stage": o["stage"], "order": o})

    def api_orders_cancel(self, oid):
        nickname = self.require_auth()
        if not nickname:
            return
        with _lock:
            orders = load_json_file(ORDERS_FILE, [])
            o = next((x for x in orders if x.get("id") == oid), None)
            if not o:
                return self.send_json(404, {"ok": False, "msg": "订单不存在"})
            if o.get("nickname") != nickname:
                return self.send_json(403, {"ok": False, "msg": "无权操作他人订单"})
            if o["stage"] != 0:
                return self.send_json(422, {"ok": False, "msg": "已发货订单如需取消，请联系客服"})
            o["stage"] = -1
            save_json_file(ORDERS_FILE, orders)
        self.send_json(200, {"ok": True, "msg": "订单已取消", "order": o})

    # ---- 地址簿 ----
    def api_addresses_list(self):
        nickname = self.require_auth()
        if not nickname:
            return
        addrs = [a for a in load_json_file(ADDRS_FILE, []) if a.get("nickname") == nickname]
        addrs.sort(key=lambda a: (not a.get("isDefault"), a.get("created", "")))
        self.send_json(200, {"ok": True, "addresses": addrs})

    def api_addresses_add(self):
        nickname = self.require_auth()
        if not nickname:
            return
        data = self.read_json() or {}
        err = check_addr(data)
        if err:
            return self.send_json(400, {"ok": False, "msg": err})
        with _lock:
            addrs = load_json_file(ADDRS_FILE, [])
            mine = [a for a in addrs if a.get("nickname") == nickname]
            if len(mine) >= MAX_ADDRS:
                return self.send_json(422, {"ok": False, "msg": f"最多保存 {MAX_ADDRS} 条地址"})
            is_default = bool(data.get("isDefault")) or not mine
            if is_default:
                for a in mine:
                    a["isDefault"] = False
            rec = {"id": "ad_" + secrets.token_hex(3), "nickname": nickname,
                   **{k: str(data.get(k, "")).strip() for k in ("name", "phone", "prov", "city", "detail")},
                   "isDefault": is_default, "created": time.strftime("%Y-%m-%d %H:%M:%S")}
            addrs.append(rec)
            save_json_file(ADDRS_FILE, addrs)
        self.send_json(200, {"ok": True, "address": rec, "msg": "地址已保存"})

    def _addr_mine(self, aid):
        """查找属于当前用户的地址记录，异常时已发送响应返回 None"""
        nickname = self.require_auth()
        if not nickname:
            return None, None
        addrs = load_json_file(ADDRS_FILE, [])
        rec = next((a for a in addrs if a.get("id") == aid), None)
        if not rec:
            self.send_json(404, {"ok": False, "msg": "地址不存在"})
            return None, None
        if rec.get("nickname") != nickname:
            self.send_json(403, {"ok": False, "msg": "无权操作他人地址"})
            return None, None
        return addrs, rec

    def api_addresses_update(self, aid):
        with _lock:
            addrs, rec = self._addr_mine(aid)
            if rec is None:
                return
            data = self.read_json() or {}
            merged = {**rec, **{k: data[k] for k in ("name", "phone", "prov", "city", "detail") if k in data}}
            err = check_addr(merged)
            if err:
                return self.send_json(400, {"ok": False, "msg": err})
            if data.get("isDefault"):
                for a in addrs:
                    if a.get("nickname") == rec["nickname"]:
                        a["isDefault"] = (a is rec)
            for k in ("name", "phone", "prov", "city", "detail"):
                if k in data:
                    rec[k] = str(data[k]).strip()
            save_json_file(ADDRS_FILE, addrs)
        self.send_json(200, {"ok": True, "address": rec, "msg": "地址已更新"})

    def api_addresses_delete(self, aid):
        with _lock:
            addrs, rec = self._addr_mine(aid)
            if rec is None:
                return
            was_default = rec.get("isDefault")
            addrs.remove(rec)
            if was_default:
                rest = [a for a in addrs if a.get("nickname") == rec["nickname"]]
                if rest:
                    rest[0]["isDefault"] = True
            save_json_file(ADDRS_FILE, addrs)
        self.send_json(200, {"ok": True, "msg": "地址已删除"})


# ---------------- 订单领域：地址校验与物流轨迹生成 ----------------
def check_addr(a):
    """返回错误信息；None 表示合法"""
    if not str(a.get("name", "")).strip():
        return "请填写收货人姓名"
    if not re.match(r"^1\d{10}$", str(a.get("phone", "")).strip()):
        return "请填写正确的 11 位手机号"
    if not str(a.get("prov", "")).strip() or not str(a.get("city", "")).strip():
        return "请选择收货省市"
    if len(str(a.get("detail", "")).strip()) < 5:
        return "详细地址至少 5 个字"
    return None


EXPRESS_CO = ["雪峰速运", "顺丰速运", "京东物流", "中通快递", "圆通速递"]
DISTRICTS = ["新城", "高新", "开发", "望江", "城东", "城西", "城南", "江北", "和平", "云水"]  # 通用中性区名，避免与收货城市强关联穿帮
SURNAMES = ["王", "李", "张", "刘", "陈", "赵", "木"]
LAST_MILE = ["收件人已本人签收", "快递员送至楼下，收件人当面签收", "包裹由前台代签收",
             "包裹已投入智能快递柜，取件码已发送", "包裹已送达驿站，凭取件码领取"]


def build_traces(order):
    """以 订单号+收货人+城市 作种子编写 6 段物流轨迹（同一订单结果稳定，时间逐段递增）"""
    seed_src = order["id"] + "|" + order["addr"]["name"] + "|" + order["addr"]["city"]
    rnd = random.Random(int(hashlib.md5(seed_src.encode("utf-8")).hexdigest()[:8], 16))
    co = rnd.choice(EXPRESS_CO)
    waybill = "SP%012d" % rnd.randrange(10 ** 12)
    district = rnd.choice(DISTRICTS)
    guy = rnd.choice(SURNAMES)
    phone = "1" + rnd.choice(["38", "39", "86", "85", "76"]) + "%08d" % rnd.randrange(10 ** 8)
    prov, city = order["addr"]["prov"], order["addr"]["city"]
    t0 = order["time"]
    gaps = [0, rnd.uniform(2, 5), rnd.uniform(5, 9), rnd.uniform(12, 20), rnd.uniform(5, 9), rnd.uniform(5, 11)]
    acc, ts = 0, []
    for g in gaps:
        acc += g
        ts.append(t0 + int(acc * 3600 * 1000))
    ts = [max(ts[i], t0 + i * 60 * 1000) for i in range(6)]  # 不早于下单时间且逐条递增
    txts = [
        "您的订单提交成功，仓库正在排队处理中",
        f"快件已由 雪峰总部集散中心（浙江杭州）揽收 · {co} 运单 {waybill}",
        f"快件离开 杭州集散中心，发往【{prov}转运中心】",
        f"快件已到达 {prov}{city} {district}中转部，正在分拣",
        f"派送中：快递员{guy}师傅（{phone}）正在为您派送，请保持电话畅通",
        "包裹已送达：" + rnd.choice(LAST_MILE) + "，感谢使用雪峰优选！",
    ]
    return [{"txt": txts[i], "t": ts[i]} for i in range(6)]


def save_addr_from_order(nickname, addr):
    """下单时勾选“保存地址”：同地址（手机+详址）已存在则不重复，否则新增为默认"""
    with _lock:
        addrs = load_json_file(ADDRS_FILE, [])
        mine = [a for a in addrs if a.get("nickname") == nickname]
        for a in mine:
            if a.get("phone") == addr["phone"] and a.get("detail") == addr["detail"]:
                return  # 已有相同地址，不重复存
        if len(mine) >= MAX_ADDRS:
            return
        for a in mine:
            a["isDefault"] = False
        addrs.append({"id": "ad_" + secrets.token_hex(3), "nickname": nickname, **addr,
                      "isDefault": True, "created": time.strftime("%Y-%m-%d %H:%M:%S")})
        save_json_file(ADDRS_FILE, addrs)


def main():
    load_sessions()  # 恢复落盘会话，重启不掉线
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"雪峰优选商城已启动：http://127.0.0.1:{PORT}  （Ctrl+C 停止）")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
