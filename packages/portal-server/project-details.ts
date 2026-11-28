import { load } from "cheerio";

const clean = (text: string) => text.replace(/\s+/g, " ").trim();
export function parseProjectOverview(html: string) {
  const $ = load(html);
  const root = $("#project-show");
  const name = clean(root.find(".project-header h3").text());
  if (!name) throw new Error("The official project page did not load. Sign in again.");
  const section = (heading: string) =>
    root
      .find("h4")
      .filter((_, e) => clean($(e).text()) === heading)
      .first()
      .parent();
  const list = (heading: string) =>
    section(heading)
      .find(".skill-list")
      .html()
      ?.split(/<br\s*\/?\s*>/i)
      .map((line) => clean(load(line).text()))
      .filter(Boolean) ?? [];
  const summary = root.find(".project-summary-item").first();
  const registration = root.find("#projects_registrations_stats");
  return {
    name,
    unregisterSlug: projectUnregistration(html)?.slug ?? null,
    status: clean(root.find(".project-status-box").attr("data-status") ?? ""),
    metadata: clean(summary.text()),
    description: clean(section("Description").find("p").text()),
    keywords: list("Keywords"),
    skills: list("Skills"),
    notes: root
      .find(".project-summary-item")
      .toArray()
      .flatMap((e) => {
        const item = $(e);
        if (
          item.is(summary) ||
          item.find("form, a, .text-danger, .project-attachments-list").length
        )
          return [];
        const text = clean(item.text());
        return text ? [text] : [];
      }),
    requirements: root
      .find(".project-summary-item .text-danger")
      .toArray()
      .map((e) => clean($(e).text()))
      .filter(Boolean),
    steps: root
      .find(".project-summary-item .project-list-item a[href]")
      .toArray()
      .flatMap((e) => {
        const path = $(e).attr("href") ?? "";
        const match = /^\/([a-z0-9_-]+)\/mine$/i.exec(path);
        return match ? [{ name: clean($(e).text()), slug: match[1] }] : [];
      }),
    personalSlug:
      root
        .find(".project-summary-item a[href]")
        .toArray()
        .flatMap((e) => {
          const match = /^\/([a-z0-9_-]+)\/mine$/i.exec($(e).attr("href") ?? "");
          return match && $(e).find("button").length ? [match[1]] : [];
        })[0] ?? null,
    attachments: root
      .find(".project-attachments-list a[href]")
      .toArray()
      .flatMap((e) => {
        const url = new URL($(e).attr("href") ?? "", "https://projects.intra.42.fr");
        if (url.origin !== "https://cdn.intra.42.fr" || url.username || url.password) return [];
        return [{ name: clean($(e).text()), url: url.href }];
      }),
    projectId: Number(registration.attr("project_id")) || null,
    sessionId: Number(registration.attr("project_session_id")) || null,
  };
}

export function parseProjectTeams(html: string) {
  const $ = load(html);
  return $("#teams-accordion .team-item")
    .toArray()
    .map((e) => {
      const team = $(e);
      return {
        id: team.find(".team-content").attr("id") ?? clean(team.find(".team-name").text()),
        canFinish: !!projectFinishAction(html, team.find(".team-content").attr("id") ?? ""),
        closed:
          /\band closed\b/i.test(team.find(".team-lock-and-close").text()) ||
          team
            .find(".team-status-dot.text-success")
            .toArray()
            .some((dot) =>
              /closed/i.test($(dot).attr("data-original-title") ?? $(dot).attr("title") ?? ""),
            ),
        name: clean(team.find(".team-name").text()),
        mark: clean(team.find(".team-mark").text()).replace(/●/g, "").trim(),
        success: team.find(".team-mark .text-success").length > 0,
        timeline: clean(team.find(".team-lock-and-close").text()),
        repository: team.find("[data-clipboard-text]").attr("data-clipboard-text") ?? null,
        progress: team
          .find(".team-status-dot")
          .toArray()
          .map((dot) => ({
            label: $(dot).attr("data-original-title") ?? $(dot).attr("title") ?? "",
            complete: $(dot).hasClass("text-success"),
          })),
        evaluations: team
          .find(".correction-item")
          .toArray()
          .map((entry) => {
            const correction = $(entry);
            const header = correction.find(".corrected-header").first();
            const login = header.find("[data-tooltip-login]").attr("data-tooltip-login") ?? null;
            const comments = correction
              .find(".correction-comment-item")
              .toArray()
              .map((comment) => {
                const copy = $(comment).clone();
                copy.find(".correction-comment-body").remove();
                return clean(copy.text());
              });
            return {
              login,
              evaluator: login ?? "Moulinette",
              date: clean(header.find("[data-long-date]").text()),
              mark: clean(header.find(".pull-right").text()),
              success: header.find(".pull-right.text-success").length > 0,
              comment: comments[0] ?? "",
              feedback: comments[1] ?? null,
              ratings: correction
                .find(".feedback-item")
                .toArray()
                .map((rating) => ({
                  label: $(rating).attr("title") ?? "",
                  value: clean($(rating).text()) || `${$(rating).find(".text-success").length} / 5`,
                })),
            };
          }),
      };
    });
}

export function parseRegistrationStats(html: string) {
  const $ = load(html);
  return $("p")
    .toArray()
    .flatMap((e) => {
      const node = $(e).clone();
      node.find("p, a").remove();
      const text = clean(node.text());
      return text && /\d/.test(text) ? [text] : [];
    });
}

export function parseProjectStats(value: unknown) {
  if (!value || typeof value !== "object")
    throw new Error("42 returned invalid project statistics.");
  const data = value as Record<string, unknown>;
  const finite = (value: unknown) => {
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new Error("42 returned invalid chart values.");
    return value;
  };
  const number = (value: unknown) => {
    const result = finite(value);
    if (result < 0) throw new Error("42 returned invalid chart values.");
    return result;
  };
  const outcomes = (value: unknown) => {
    if (!value || typeof value !== "object")
      throw new Error("42 returned invalid project outcomes.");
    const entry = value as Record<string, unknown>;
    return {
      none: number(entry.none ?? 0),
      true: number(entry.true ?? 0),
      false: number(entry.false ?? 0),
    };
  };
  if (!Array.isArray(data.final_mark_by_campus) || !Array.isArray(data.flags))
    throw new Error("42 returned invalid project charts.");
  return {
    success: outcomes(data.success),
    average_team_lifespan: outcomes(data.average_team_lifespan),
    final_mark_by_campus: data.final_mark_by_campus.map((entry) => {
      if (!entry || typeof entry.name !== "string" || !Array.isArray(entry.data))
        throw new Error("42 returned invalid campus marks.");
      return {
        name: entry.name,
        data: entry.data.map((point: unknown) => {
          if (!Array.isArray(point) || point.length !== 2)
            throw new Error("42 returned invalid grade points.");
          return [finite(point[0]), number(point[1])] as [number, number];
        }),
      };
    }),
    flags: data.flags.map((entry) => {
      if (!entry || typeof entry.name !== "string")
        throw new Error("42 returned invalid evaluation flags.");
      return { name: entry.name, y: number(entry.y) };
    }),
  };
}

export function projectUnregistration(html: string) {
  const $ = load(html);
  const link = $("#project-show .project-summary-item a[data-method='delete']")
    .toArray()
    .find(
      (e) =>
        /^\/projects\/[a-z0-9_-]+\/projects_users\/[1-9]\d*$/i.test($(e).attr("href") ?? "") &&
        clean($(e).text()) === "Unregister",
    );
  if (!link) return null;
  const path = $(link).attr("href") ?? "";
  return {
    path,
    slug: path.split("/")[2],
    csrf: $("meta[name='csrf-token']").attr("content") ?? "",
  };
}

export function projectFinishAction(html: string, teamId: string) {
  if (!/^team-[1-9]\d*$/.test(teamId)) return null;
  const $ = load(html);
  const team = $("#teams-accordion .team-item").filter(
    (_, e) => $(e).find(".team-content").attr("id") === teamId,
  );
  const control = team
    .find("a, button, input[type='submit']")
    .filter((_, e) =>
      /^set (?:the )?project as finished$/i.test(clean($(e).text() || $(e).attr("value") || "")),
    )
    .first();
  if (!control.length || control.is("[disabled], .disabled")) return null;
  const form = control.closest("form");
  const method = (
    control.attr("data-method") ??
    form.find("input[name='_method']").attr("value") ??
    form.attr("method") ??
    ""
  ).toLowerCase();
  if (!["post", "patch", "put"].includes(method)) return null;
  const href = control.attr("href") ?? form.attr("action") ?? "";
  if (!URL.canParse(href, "https://projects.intra.42.fr")) return null;
  const url = new URL(href, "https://projects.intra.42.fr");
  const match = /^\/(?:projects\/([a-z0-9_-]+)\/)?teams\/([1-9]\d*)(?:\/[a-z_]+)?$/i.exec(
    url.pathname,
  );
  if (
    url.origin !== "https://projects.intra.42.fr" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !match ||
    `team-${match[2]}` !== teamId
  )
    return null;
  return {
    path: url.pathname,
    slug: match[1] ?? null,
    method,
    csrf:
      $("meta[name='csrf-token']").attr("content") ??
      form.find("input[name='authenticity_token']").attr("value") ??
      "",
  };
}
