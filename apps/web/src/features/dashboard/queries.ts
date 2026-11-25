import { queryOptions } from "@tanstack/react-query";
import { readIntra, type Session } from "@/lib/intra";

export type Data = Record<string, unknown>;

export function object(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Data) : {};
}

export function rows(value: unknown): Data[] {
  return Array.isArray(value) ? value.map(object) : [];
}

export function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function dashboardQuery<T>(
  session: Session,
  resource: string,
  select: (data: unknown) => T,
  params: Record<string, string> = {},
) {
  return queryOptions({
    queryKey: ["intra", session.cacheKey, resource, params],
    queryFn: ({ signal }) => readIntra(session, resource, params, signal),
    select,
    staleTime: 60_000,
    retry: false,
  });
}
