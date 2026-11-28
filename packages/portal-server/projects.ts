import { load } from "cheerio";

import { buildProjectGraph, graphVariants } from "./project-graph-layout.ts";

function graphVariant(page: string) {
  const variant = load(page)("canvas.graph-canvas").attr("data-quest");
  if (variant === "42next" || variant === "default") return variant;
}

export function parseProjectGraphStates(data: unknown, graphPage = "") {
  if (!Array.isArray(data)) throw new Error("42 returned invalid project graph data.");
  const nodes = data.flatMap((node) =>
    Number.isSafeInteger(node?.project_id) && node.project_id > 0 && typeof node.state === "string"
      ? [{ id: node.project_id as number, state: node.state as string, slug: node.slug as unknown }]
      : [],
  );
  const nextTrack = graphVariant(graphPage) === "42next";
  const bySlug = new Map(nodes.map((node) => [node.slug, node]));
  for (const [classicSlug, nextSlug] of graphVariants) {
    const classic = bySlug.get(classicSlug);
    const next = bySlug.get(nextSlug);
    if (!classic || !next) continue;

    const current = nextTrack ? next.state : classic.state;
    const alternate = nextTrack ? classic.state : next.state;
    // The bundled graph keeps the classic node ID. The portal can display progress from either version.
    classic.state =
      (current === "available" || current === "unavailable") &&
      (alternate === "done" || alternate === "fail")
        ? alternate
        : current;
  }
  return nodes.map(({ id, state }) => ({ id, state }));
}

export function parseProjectList(html: string, page: number) {
  const $ = load(html);
  if (!$("#projects-list-container, .projects-list-container").length)
    throw new Error("The official project list did not load. Sign in again.");
  const items = $("li.project-item")
    .map((_index, element) => {
      const row = $(element);
      const link = row.find('.project-name a[href^="/projects/"]').first();
      const slug = link.attr("href")?.match(/^\/projects\/([a-z0-9_-]+)$/i)?.[1];
      if (!slug) throw new Error("42 returned an invalid project link.");
      const name = link.text().trim();
      const fullName = row.find(".project-name").text().replace(/\s+/g, " ").trim();
      const result =
        row.find(".project-name").attr("data-result") ||
        fullName.match(/\((?:succeeded|failed) with [^)]+\)/i)?.[0];
      const parent = fullName
        .slice(0, fullName.indexOf(name))
        .trim()
        .replace(/\s*\/\s*$/, "");
      const xpText = row.attr("data-difficulty") ?? row.find(".project-difficulty").text();
      const xp = Number.parseInt(xpText.replace(/,/g, ""), 10);
      const recommendation = row
        .find(".project-recomendation, .project-recommendation")
        .text()
        .trim();
      const registration =
        row.find(".project-registration").first().text().trim() ||
        row.attr("data-registration")?.replaceAll("_", " ");
      return {
        id: slug,
        slug,
        name,
        parent: parent || undefined,
        duration: row.find(".project-duration").text().trim() || undefined,
        xp: Number.isFinite(xp) ? xp : undefined,
        recommendation: recommendation || undefined,
        registration: registration || undefined,
        result,
        resultSuccess: result ? /^\(succeeded/i.test(result) : undefined,
      };
    })
    .get();
  const hasMore = $(".pagination a[href]")
    .toArray()
    .some((element) => {
      const href = $(element).attr("href");
      return (
        href &&
        Number(new URL(href, "https://projects.intra.42.fr").searchParams.get("page")) > page
      );
    });
  return { items, hasMore };
}

export function parseProjectGraph(data: unknown, cursus = "9", page = "") {
  const variant = graphVariant(page);
  if (cursus === "21" && !variant)
    throw new Error("42 did not identify the project graph variant.");
  return buildProjectGraph(data, cursus, variant ?? "default");
}
