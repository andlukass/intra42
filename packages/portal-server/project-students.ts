import { load } from "cheerio";

export type ProjectStudentKind = "without_team" | "can_register";
export function parseProjectStudentLinks(html: string) {
  const $ = load(html);
  return $("a[href]")
    .toArray()
    .flatMap((element) => {
      const match = /^\/projects\/([a-z0-9_-]+)\/all_users\/(without_team|can_register)$/.exec(
        $(element).attr("href") ?? "",
      );
      if (!match) return [];
      return [
        {
          slug: match[1],
          kind: match[2] as ProjectStudentKind,
          label: $(element).text().replace(/\s+/g, " ").trim(),
        },
      ];
    });
}

export function parseProjectStudents(html: string, page: number) {
  const $ = load(html);
  const summary = /\b(\d+) users (?:without a team registered to|can register to)\b/.exec(
    $("body").text(),
  );
  if (!summary) throw new Error("The official student list did not load. Sign in again.");
  const users = $("a.student-item[data-tooltip-login]")
    .toArray()
    .flatMap((element) => {
      const node = $(element);
      const login = node.attr("data-tooltip-login") ?? "";
      if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(login)) return [];
      const href = new URL(node.attr("href") ?? "", "https://profile.intra.42.fr");
      if (href.origin !== "https://profile.intra.42.fr" || href.pathname !== `/users/${login}`)
        return [];
      const image = /url\(["']?([^\s)'";]+)/.exec(
        node.find(".student-image").attr("style") ?? "",
      )?.[1];
      const imageUrl = image && URL.canParse(image) ? new URL(image) : null;
      const cdn_uri =
        imageUrl?.origin === "https://cdn.intra.42.fr" && !imageUrl.username && !imageUrl.password
          ? imageUrl.href
          : undefined;
      return [
        {
          login,
          ...(cdn_uri ? { cdn_uri } : {}),
          available: node.find(".student-location").length > 0,
          closed: node.closest(".student-wrapper").hasClass("closed"),
        },
      ];
    });
  const hasMore = $(".pagination a[rel='next']")
    .toArray()
    .some((element) => {
      const href = new URL($(element).attr("href") ?? "", "https://projects.intra.42.fr");
      return Number(href.searchParams.get("page")) > page;
    });
  return { users, total: Number(summary[1]), page, hasMore };
}
