import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTaskSearch } from "../src/useTaskSearch";
import type { StatusFilter } from "../src/types";
import { tick } from "./util";

/** 期望值为种子数据字面量（固定演示数据），不复制过滤实现逻辑。 */
const LOGIN = ["登录功能开发", "登录输入校验", "登录状态恢复", "登录文案优化"];
const API = ["任务列表接口对接", "用户资料接口联调", "接口超时处理", "接口权限回归"];

const titles = (list: { title: string }[]) => list.map((t) => t.title);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

/**
 * 复现题目路径：先查询“登录”（450ms），在其结束前查询“接口”（200ms），
 * 较早查询会在较新查询之后结束。
 */
describe("T1 竞态：较早成功不得覆盖新结果", () => {
  it("旧请求晚到并落定后，列表仍是新查询的结果", async () => {
    const { result, rerender } = renderHook(
      ({ q, s }: { q: string; s: StatusFilter }) => useTaskSearch(q, s),
      { initialProps: { q: "登录", s: "ALL" } },
    );
    await tick(100); // 旧“登录”仍在途
    rerender({ q: "接口", s: "ALL" }); // t=100 发起，t=300 结束
    await tick(250); // t=350：新查询已落定
    expect(titles(result.current.tasks)).toEqual(API);
    expect(result.current.error).toBe("");

    await tick(200); // t=550：旧“登录”此时才结束
    expect(titles(result.current.tasks)).toEqual(API); // 未被覆盖
  });
});

describe("T1 竞态：较早失败不得污染新错误", () => {
  it("旧“失败”在新查询发起之后才报错，error 保持为空", async () => {
    const { result, rerender } = renderHook(
      ({ q, s }: { q: string; s: StatusFilter }) => useTaskSearch(q, s),
      { initialProps: { q: "失败", s: "ALL" } },
    );
    await tick(150); // 旧“失败”（200ms 后 reject）仍在途
    rerender({ q: "接口", s: "ALL" }); // t=150 发起，t=350 结束
    await tick(100); // t=250：旧请求已 reject
    expect(result.current.error).toBe(""); // 未污染

    await tick(200); // t=450：新查询成功
    expect(titles(result.current.tasks)).toEqual(API);
    expect(result.current.error).toBe("");
  });
});

describe("T1 竞态：较早结束时新查询的 loading 不得提前关闭", () => {
  it("旧“接口”先结束时，新“登录”仍处于加载态", async () => {
    const { result, rerender } = renderHook(
      ({ q, s }: { q: string; s: StatusFilter }) => useTaskSearch(q, s),
      { initialProps: { q: "接口", s: "ALL" } },
    );
    await tick(100);
    rerender({ q: "登录", s: "ALL" }); // 新查询 t=550 结束
    await tick(150); // t=250：旧请求的结束回调早已执行
    expect(result.current.loading).toBe(true); // 新查询仍在加载
    await tick(400); // t=650：新查询结束
    expect(result.current.loading).toBe(false);
    expect(titles(result.current.tasks)).toEqual(LOGIN);
  });
});

describe("T1 最新请求：失败与失败后的重试均须可用", () => {
  it("最新查询失败展示错误；重试成功后错误清除、结果可用", async () => {
    const { result, rerender } = renderHook(
      ({ q, s }: { q: string; s: StatusFilter }) => useTaskSearch(q, s),
      { initialProps: { q: "失败", s: "ALL" } },
    );
    await tick(250); // 最新请求自身失败
    expect(result.current.error).toBe("模拟查询失败");
    expect(result.current.loading).toBe(false);

    rerender({ q: "接口", s: "ALL" }); // 失败后重试
    expect(result.current.loading).toBe(true);
    await tick(250);
    expect(result.current.error).toBe("");
    expect(titles(result.current.tasks)).toEqual(API);
    expect(result.current.loading).toBe(false);
  });
});

describe("T1 生命周期：组件离开时清理本次请求", () => {
  it("卸载后在途请求被取消，不遗留计时器", async () => {
    const { unmount } = renderHook(() => useTaskSearch("登录", "ALL"));
    await tick(50); // “登录”在途（450ms）
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount(); // cleanup 应 abort 并清除 setTimeout
    expect(vi.getTimerCount()).toBe(0);
  });
});
