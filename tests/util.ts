import { vi } from "vitest";
// 使用 RTL 导出的 act：它已正确配置 React 19 的 act 环境。
import { act } from "@testing-library/react";

/**
 * 受控时钟推进：把假时钟的推进与微任务 flush 包进 act，
 * 保证 React 状态更新被完整处理后再做断言。
 * T3 要求：竞态与时序断言以此为驱动，不使用固定长时间 sleep。
 */
export async function tick(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
