import { load } from "cheerio";

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
