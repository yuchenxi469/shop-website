import { useEffect, useState } from "react";
import { searchTasks } from "./api";
import type { Task, StatusFilter } from "./types";
// 导出统一的查询标识，供 hook 内部与 App 页码钳制共用，避免分隔符不同步。
export function queryKey(q: string, status: StatusFilter): string {
  return `${q}\u0000${status}`;
}
export function useTaskSearch(q: string, status: StatusFilter) {
  const [tasks, setTasks] = useState<Task[]>([]);
  // T2：初始即置为加载中，避免首屏用“加载前的空列表”提前钉制页码。
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // 记录“当前已成功落定的查询”的 key；仅当它等于当前 q/status 时，
  // 才说明眼前 tasks 属于本次查询，可安全用于页码钉制（与 T1 咬合）。
  const [successKey, setSuccessKey] = useState<string | null>(null);
  useEffect(() => {
    // T1：为每次查询建立独立的生命周期。
    // controller 用于取消上一次/卸载时的请求；active 标志确保只有当前有效
    // 查询能提交结果、错误和结束状态，避免较早请求晚于新请求结束时造成竞态。
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    searchTasks(q, status, controller.signal)
      .then((result) => {
        if (active) {
          setTasks(result);
          setSuccessKey(queryKey(q, status));
        }
      })
      .catch((e: unknown) => {
        // 被主动取消的旧请求不得污染当前错误状态。
        if (active && (e as { name?: string }).name !== "AbortError") {
          setError((e as Error).message);
        }
      })
      .finally(() => {
        // 较早请求结束时不得提前关闭新查询的 loading。
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [q, status]);
  return { tasks, loading, error, successKey };
}
