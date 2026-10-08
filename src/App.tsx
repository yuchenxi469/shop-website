import { useEffect, useState } from "react";
import type { StatusFilter } from "./types";
import { useTaskSearch, queryKey } from "./useTaskSearch";
import { pageOf, readQuery, writeQuery } from "./query";
export default function App() {
  // T2：以 URL 作为“已提交状态”的唯一数据源，初始从地址栏恢复。
  const initial = readQuery(window.location.search);
  const [draft, setDraft] = useState(initial.q); // 未提交的输入框内容，不进 URL
  const [q, setQ] = useState(initial.q);
  const [status, setStatus] = useState<StatusFilter>(initial.status);
  const [page, setPage] = useState(initial.page);
  const { tasks, loading, error, successKey } = useTaskSearch(q, status);
  const view = pageOf(tasks, page);

  // T2：浏览器前进/后退时，从 URL 恢复输入、筛选、页码并发起对应查询。
  useEffect(() => {
    function onPop() {
      const f = readQuery(window.location.search);
      setQ(f.q);
      setStatus(f.status);
      setPage(f.page);
      setDraft(f.q); // 搜索输入框同步
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // T2：仅当“当前 q/status 这次查询已成功落定”后，才按结果页数钳制越界页码。
  // successKey===当前key 保证不会用加载前空列表或上一次查询结果提前改成1。
  useEffect(() => {
    if (loading || error || successKey !== queryKey(q, status)) return;
    if (page !== view.current) {
      setPage(view.current);
      writeQuery({ q, status, page: view.current }, "replace");
    }
  }, [loading, error, successKey, q, status, page, view.current]);

  function search(e: React.FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    setQ(next);
    setPage(1);
    // 点击查询：搜索词 trim，页码回 1，replace 当前历史项。
    writeQuery({ q: next, status, page: 1 }, "replace");
  }
  function changeStatus(v: StatusFilter) {
    setStatus(v);
    setPage(1);
    // 筛选变化：页码回 1，push 历史项。
    writeQuery({ q, status: v, page: 1 }, "push");
  }
  function goPage(next: number) {
    setPage(next);
    // 翻页：push 历史项（页码不进查询参数，不会重新发起查询）。
    writeQuery({ q, status, page: next }, "push");
  }
  return (
    <>
      <header>
        <div className="brand">
          TaskBoard<span>任务看板</span>
        </div>
      </header>
      <main>
        <h1>项目任务</h1>
        <p className="subtitle">搜索、筛选和查看团队任务。</p>
        <form className="toolbar" onSubmit={search}>
          <label className="search">
            搜索任务
            <input
              placeholder="搜索任务标题"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <label>
            状态
            <select
              value={status}
              onChange={(e) => changeStatus(e.target.value as StatusFilter)}
            >
              <option value="ALL">全部状态</option>
              <option value="TODO">待办</option>
              <option value="DOING">进行中</option>
              <option value="DONE">已完成</option>
            </select>
          </label>
          <button className="primary">查询</button>
        </form>
        <p className="count muted" aria-live="polite">
          {tasks.length}项任务
        </p>
        <section className="panel" aria-label="任务列表" aria-busy={loading}>
          <div className="table-row table-head">
            <span>任务</span>
            <span>状态</span>
            <span className="owner">负责人</span>
          </div>
          {error ? (
            <div role="alert" className="error">
              {error}
            </div>
          ) : loading ? (
            <div role="status" className="state">
              正在查询…
            </div>
          ) : tasks.length === 0 ? (
            <div className="state">没有匹配的任务</div>
          ) : (
            view.items.map((t) => (
              <div className="table-row" key={t.id}>
                <div>
                  <div className="task-title">{t.title}</div>
                  <div className="task-detail">{t.description}</div>
                </div>
                <div>
                  <span className={"tag " + t.status}>{t.status}</span>
                </div>
                <span className="owner">{t.owner}</span>
              </div>
            ))
          )}
        </section>
        <nav className="pager" aria-label="分页">
          <button
            disabled={loading || view.current === 1}
            onClick={() => goPage(view.current - 1)}
          >
            上一页
          </button>
          <span>
            第{view.current}页 共{view.pages}页
          </span>
          <button
            disabled={loading || view.current === view.pages}
            onClick={() => goPage(view.current + 1)}
          >
            下一页
          </button>
        </nav>
      </main>
    </>
  );
}
