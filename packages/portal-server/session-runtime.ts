import { setTimeout as nodeTimeout } from "node:timers";

const reloaders: (() => void | Promise<void>)[] = [];
export function onSessionReload(callback: () => void | Promise<void>) {
  reloaders.push(callback);
  return callback();
}
export async function reloadSessionMaps() {
  for (const reload of reloaders) await reload();
}
export function setTimeout(callback: () => void, milliseconds: number) {
  const timer = nodeTimeout(callback, milliseconds);
  // Functions expire records on reads; background timers cannot safely update persisted state.
  if (process.env.INTRA42_FUNCTIONS === "1") clearTimeout(timer);
  return timer;
}
