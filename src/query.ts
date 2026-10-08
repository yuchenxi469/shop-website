import type { Filters, StatusFilter } from "./types";

const VALID_STATUS: StatusFilter[] = ["ALL", "TODO", "DOING", "DONE"];

/** 页码规范化：仅“正安全整数”有效；缺省/非正/非整数/非数值 → 1。 */
function normalizePage(raw: string | null): number {
  if (raw === null || raw === "") return 1;
  // 只接受纯十进制数字，拒绝负数、小数、科学计数、空格与非数值。
  if (!/^\d+$/.test(raw)) return 1;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) return 1;
  return n;
}

/** 状态规范化：非法或未知值 → ALL。 */
function normalizeStatus(raw: string | null): StatusFilter {
  return raw && (VALID_STATUS as string[]).includes(raw)
    ? (raw as StatusFilter)
    : "ALL";
}

/**
 * T2：从 URL 查询串恢复已提交状态。
 * 注意：越界但格式合法的页码（如 page=999）在此保留原值，交由“当前查询
 * 成功后”再按结果页数钳制；此处只处理格式非法 → 1。
 */
export function readQuery(search: string): Filters {
  const p = new URLSearchParams(search);
  return {
    q: (p.get("q") ?? "").trim(),
    status: normalizeStatus(p.get("status")),
    page: normalizePage(p.get("page")),
  };
}

/**
 * 纯函数：基于已有 search 构建新的查询串。
 * - 省略默认值（q 空、status ALL、page 1 时删除对应 key）；
 * - 保留无关参数（编码由 URLSearchParams 处理，中文/空格/& 不被破坏）；
 * 不触碰 history/location，便于单测复用（利于 T3）。
 */
export function buildSearch(filters: Filters, baseSearch: string): string {
  const params = new URLSearchParams(baseSearch);
  const { q, status, page } = filters;
  if (q) params.set("q", q);
  else params.delete("q");
  if (status && status !== "ALL") params.set("status", status);
  else params.delete("status");
  if (page && page !== 1) params.set("page", String(page));
  else params.delete("page");
  return params.toString();
}

/** 组装含 pathname、query、hash 的完整 URL；无参数时不留空的“?”。 */
function composeUrl(search: string): string {
  const { pathname, hash } = window.location;
  return search ? `${pathname}?${search}${hash}` : `${pathname}${hash}`;
}

/**
 * T2：把已提交状态写入历史。
 * push 增加历史项；replace 替换当前历史项（查询、越界页码规范化用 replace）。
 */
export function writeQuery(filters: Filters, mode: "push" | "replace"): void {
  const search = buildSearch(filters, window.location.search);
  const url = composeUrl(search);
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

export function pageOf<T>(items: T[], page: number, size = 6) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(pages, Math.max(1, page));
  return {
    items: items.slice((current - 1) * size, current * size),
    current,
    pages,
  };
}
