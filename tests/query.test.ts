import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readQuery, buildSearch, writeQuery } from "../src/query";
import type { Filters } from "../src/types";

const f = (q: string, status: Filters["status"], page: number): Filters => ({
  q,
  status,
  page,
});

/**
 * 场景「非法参数」：readQuery 为纯函数，直接喂查询串断言规范化结果。
 * 期望值全部是字面量，不复制实现逻辑。
 */
describe("readQuery 参数规范化（场景：非法参数）", () => {
  it.each([
    ["空查询串全部走缺省", "", f("", "ALL", 1)],
    ["未知状态回落 ALL", "?status=NOPE", f("", "ALL", 1)],
    ["非数值页码归 1", "?page=abc", f("", "ALL", 1)],
    ["零页码归 1", "?page=0", f("", "ALL", 1)],
    ["负页码归 1", "?page=-2", f("", "ALL", 1)],
    ["小数页码归 1", "?page=1.5", f("", "ALL", 1)],
    ["科学计数页码归 1", "?page=1e3", f("", "ALL", 1)],
    [
      "正常中文参数解码恢复",
      "?q=%E6%8E%A5%E5%8F%A3&status=DOING&page=2",
      f("接口", "DOING", 2),
    ],
    ["已提交搜索词恢复时 trim", "?q=%20%E7%99%BB%E5%BD%95%20", f("登录", "ALL", 1)],
    ["空 q 保留为空串", "?q=", f("", "ALL", 1)],
  ])("%s", (_name, search, expected) => {
    expect(readQuery(search)).toEqual(expected);
  });

  it("格式合法但越界的页码必须保留原值，留待查询成功后钳制", () => {
    expect(readQuery("?page=999").page).toBe(999);
  });
});

/**
 * 场景「默认值省略 / 保留无关参数 / 编码不被破坏」：buildSearch 为纯函数，
 * 断言时用平台 URLSearchParams 解析其输出，不借助被测的 readQuery。
 */
describe("buildSearch 序列化（场景：默认省略、保留无关参数、编码）", () => {
  it("全部默认值时不写出 q/status/page", () => {
    expect(buildSearch(f("", "ALL", 1), "")).toBe("");
  });

  it("保留无关参数且省略默认项", () => {
    const out = new URLSearchParams(buildSearch(f("登录", "ALL", 1), "?utm=x"));
    expect(out.get("utm")).toBe("x");
    expect(out.get("q")).toBe("登录");
    expect(out.has("status")).toBe(false);
    expect(out.has("page")).toBe(false);
  });

  it("中文、空格与 & 经编码后可无损还原", () => {
    const out = new URLSearchParams(buildSearch(f("a &b c", "DOING", 3), ""));
    expect(out.get("q")).toBe("a &b c");
    expect(out.get("status")).toBe("DOING");
    expect(out.get("page")).toBe("3");
  });
});

/**
 * 场景「写入历史」：push/replace 语义、hash 与无关参数保留。
 * hash 由 writeQuery（而非 buildSearch）负责，必须在此经 history spy 断言。
 */
describe("writeQuery 写入历史（场景：push/replace、保留 hash）", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("push 增加历史项并保留无关参数与 hash", () => {
    window.history.replaceState(null, "", "/?utm=x#sec");
    const push = vi.spyOn(window.history, "pushState");
    writeQuery(f("接口", "DOING", 2), "push");
    expect(push).toHaveBeenCalledTimes(1);
    const url = new URL(push.mock.calls[0][2] as string, window.location.origin);
    expect(url.hash).toBe("#sec");
    expect(url.searchParams.get("utm")).toBe("x");
    expect(url.searchParams.get("q")).toBe("接口");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("replace 替换当前历史项且不产生 push", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    writeQuery(f("登录", "ALL", 1), "replace");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    const url = new URL(replace.mock.calls[0][2] as string, window.location.origin);
    expect(url.searchParams.get("q")).toBe("登录");
    expect(url.searchParams.has("status")).toBe(false);
    expect(url.searchParams.has("page")).toBe(false);
  });

  it("写入实际作用于 location：越界规范化页码可被读回", () => {
    writeQuery(f("", "ALL", 4), "replace");
    expect(new URLSearchParams(window.location.search).get("page")).toBe("4");
  });
});
