import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import App from "../src/App";
import { tick } from "./util";

/**
 * 初始 URL 用 replaceState 注入（jsdom 的 location 只读，不 mock location），
 * 随后卸载测试由全局 cleanup 完成。
 */
function renderAtUrl(search: string) {
  window.history.replaceState(null, "", `/${search}`);
  return render(<App />);
}

const searchInput = () =>
  screen.getByLabelText("搜索任务") as HTMLInputElement;
const statusSelect = () => screen.getByLabelText("状态") as HTMLSelectElement;
const params = () => new URLSearchParams(window.location.search);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("T2 URL 首次恢复（场景：URL首次恢复）", () => {
  it("从 URL 恢复搜索词、筛选与页码，输入框同步", async () => {
    renderAtUrl("?q=%E6%8E%A5%E5%8F%A3&status=DOING&page=2");
    // 首帧即恢复（不等待查询）
    expect(searchInput().value).toBe("接口");
    expect(statusSelect().value).toBe("DOING");
    expect(params().get("page")).toBe("2");

    await tick(300); // 查询落定：接口+DOING 共4项、仅1页
    expect(screen.getByText("任务列表接口对接")).toBeInTheDocument();
    expect(screen.getByText("第1页 共1页")).toBeInTheDocument();
  });

  it("未提交的输入不写入 URL", async () => {
    render(<App />);
    await tick(300);
    fireEvent.change(searchInput(), { target: { value: "临时草稿" } });
    expect(params().has("q")).toBe(false);
  });
});

describe("T2 页码钳制时序（场景：越界页码）", () => {
  it("加载中保持恢复页码，仅在查询成功后以 replace 钳制且不增历史", async () => {
    const push = vi.spyOn(window.history, "pushState");
    renderAtUrl("?page=999");
    // 首帧：加载中，绝不能按“空列表”把 URL 里的恢复页码提前改成 1
    // （分页器文案由 pageOf 派生，不作为“未钳制”的证据；以 URL 为准）
    expect(params().get("page")).toBe("999");
    expect(screen.getByRole("status")).toBeInTheDocument(); // 正在查询

    await tick(300); // 24 项 → 4 页，落定后钳制为第 4 页
    expect(screen.getByText("第4页 共4页")).toBeInTheDocument();
    expect(params().get("page")).toBe("4");
    expect(push).not.toHaveBeenCalled(); // 规范化只用 replace
  });

  it("空结果保持第 1 页、共 1 页，并移除越界页码参数", async () => {
    renderAtUrl("?q=%E4%B8%8D%E5%AD%98%E5%9C%A8&page=3");
    expect(params().get("page")).toBe("3"); // 加载中不提前改
    await tick(300);
    expect(screen.getByText("没有匹配的任务")).toBeInTheDocument();
    expect(screen.getByText("第1页 共1页")).toBeInTheDocument();
    expect(params().has("page")).toBe(false);
  });
});

describe("T2 查询与筛选写入（场景：查询/筛选重置）", () => {
  it("点击查询：trim、页码回 1、replace 当前历史项", async () => {
    render(<App />);
    await tick(300);
    fireEvent.change(searchInput(), { target: { value: " 登录 " } });
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    fireEvent.click(screen.getByRole("button", { name: "查询" }));

    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    const written = new URL(
      replace.mock.calls[0][2] as string,
      window.location.origin,
    );
    expect(written.searchParams.get("q")).toBe("登录"); // trim
    expect(written.searchParams.has("page")).toBe(false); // 页码回 1（默认省略）

    await tick(500); // “登录”延迟 450ms
    expect(screen.getByText("第1页 共1页")).toBeInTheDocument();
  });

  it("状态筛选变化：页码回 1 并 push 历史项", async () => {
    renderAtUrl("?page=2");
    await tick(300); // 第2页落定（URL 保持 page=2）
    expect(params().get("page")).toBe("2");
    const push = vi.spyOn(window.history, "pushState");
    fireEvent.change(statusSelect(), { target: { value: "DONE" } });

    expect(push).toHaveBeenCalledTimes(1);
    const written = new URL(
      push.mock.calls[0][2] as string,
      window.location.origin,
    );
    expect(written.searchParams.get("status")).toBe("DONE");
    expect(written.searchParams.has("page")).toBe(false); // 筛选变化页码回 1
  });
});

describe("T2 popstate 恢复（场景：popstate 恢复）", () => {
  it("前进/后退回显输入、筛选、页码并发起对应查询", async () => {
    render(<App />);
    await tick(300); // 初始 ALL 第 1 页
    // 不依赖 jsdom 的历史导航事件：先改 location，再显式派发 PopStateEvent
    act(() => {
      window.history.replaceState(null, "", "/?status=DONE&page=2");
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    expect(statusSelect().value).toBe("DONE");
    expect(searchInput().value).toBe("");

    await tick(300); // 发起对应查询并落定：DONE 共 7 项 → 第 2 页 1 项
    expect(screen.getByText("第2页 共2页")).toBeInTheDocument();
    expect(screen.getByText("长标题换行")).toBeInTheDocument();
  });
});

describe("T2 翻页写入（场景：历史 push、不重新查询）", () => {
  it("下一页 push 页码且列表切换，loading 不重新出现", async () => {
    render(<App />);
    await tick(300);
    const push = vi.spyOn(window.history, "pushState");
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(params().get("page")).toBe("2");
    expect(screen.queryByRole("status")).not.toBeInTheDocument(); // 未重新发起查询
    expect(screen.getByText("登录输入校验")).toBeInTheDocument(); // 第 2 页首项
  });
});
