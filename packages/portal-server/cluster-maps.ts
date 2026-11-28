import { load } from "cheerio";

export function parseMetaClusterMaps(html: string, campusId: number) {
  const $ = load(html);
  const root = $("#cluster-map");
  if (root.attr("data-campus-id") !== String(campusId)) {
    throw new Error("42 Meta did not return this campus's maps. Sign in again.");
  }
  return root
    .find('[role="tabpanel"][id^="cluster-"]')
    .toArray()
    .flatMap((element) => {
      const pane = $(element);
      const id = Number(pane.attr("id")?.replace("cluster-", ""));
      const name = pane.attr("data-floor")?.trim();
      const image = pane.attr("data-image") ?? pane.find("[data-image]").first().attr("data-image");
      if (!image) return [];
      const url = new URL(image, "https://meta.intra.42.fr");
      if (
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        !name ||
        url.origin !== "https://cdn.intra.42.fr" ||
        !url.pathname.startsWith(`/cluster/image/${id}/`) ||
        !url.pathname.endsWith(".svg")
      ) {
        throw new Error("42 Meta returned invalid cluster map metadata.");
      }
      return [{ id, name, image: url.href, campus_id: campusId }];
    });
}
