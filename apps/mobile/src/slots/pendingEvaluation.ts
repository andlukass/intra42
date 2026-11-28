import type { PendingEvaluation } from "../api";

export function pendingEvaluationStatus(evaluation: PendingEvaluation, now: number) {
  const remaining = Date.parse(evaluation.begin_at) - now;
  const past = remaining <= 0;
  const minutes = Math.max(1, Math.round(Math.abs(remaining) / 60_000));
  const [amount, unit] =
    minutes >= 1440
      ? [Math.round(minutes / 1440), "day"]
      : minutes >= 60
        ? [Math.round(minutes / 60), "hour"]
        : [minutes, "minute"];
  const duration = `${amount} ${unit}${amount === 1 ? "" : "s"}`;
  return {
    message:
      evaluation.kind === "evaluator"
        ? past
          ? "You are ready to evaluate"
          : "You will evaluate"
        : "You will be evaluated by",
    relativeTime: past ? `${duration} ago` : `in ${duration}`,
    canBegin: past && evaluation.kind === "evaluator" && evaluation.id > 0,
  };
}
