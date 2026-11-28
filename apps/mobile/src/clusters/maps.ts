import officialMaps from "./official-maps.json";

export type Cluster = { id: number; name: string; image: string; campus_id: number };

// Public SVG metadata verified on meta.intra.42.fr/campus/:id/clusters on 2026-11-25.
export function verifiedCampusMaps(campusId: number): Cluster[] {
  return officialMaps.filter((map) => map.campus_id === campusId);
}
export function normalizeCluster(value: unknown, selectedCampusId?: number): Cluster {
  if (!value || typeof value !== "object") throw new Error("42 returned an invalid cluster.");
  const item = value as Record<string, unknown>;
  const image = item.image;
  const nestedUrl = image && typeof image === "object" && "url" in image ? image.url : undefined;
  const imageUrl = item.image_url ?? nestedUrl ?? image;
  const campusId = item.campus_id ?? selectedCampusId;
  if (
    typeof item.id !== "number" ||
    typeof item.name !== "string" ||
    typeof campusId !== "number"
  ) {
    throw new Error("42 returned invalid cluster metadata.");
  }
  if (typeof imageUrl !== "string" || !imageUrl.trim()) {
    throw new Error("42 did not provide a map URL for this cluster.");
  }
  return { id: item.id, name: item.name, campus_id: campusId, image: imageUrl };
}

export type Workstation = {
  id: number;
  host: string;
  end_at: string | null;
  user: { id: number; login: string; image?: { link?: string; versions?: { small?: string } } };
};

export const lisboaMaps = verifiedCampusMaps(38);

export function hostId(host: string) {
  return host.replace(/[. =]/g, "").toLowerCase();
}

export function mapViewport(
  box: number[],
  seats: { x: number; y: number; width: number; height: number }[],
) {
  // Seat positions cannot describe the bounds of walls, rotated furniture or labels.
  // Preserve the complete SVG and include seats extending beyond its original viewBox.
  const left = Math.min(box[0], ...seats.map((seat) => seat.x));
  const top = Math.min(box[1], ...seats.map((seat) => seat.y));
  const right = Math.max(box[0] + box[2], ...seats.map((seat) => seat.x + seat.width));
  const bottom = Math.max(box[1] + box[3], ...seats.map((seat) => seat.y + seat.height));
  const padding = Math.max(16, Math.max(right - left, bottom - top) * 0.02);
  return [left - padding, top - padding, right - left + padding * 2, bottom - top + padding * 2];
}

export function mapInitialOffset(
  viewport: number[],
  seats: { x: number; y: number }[],
  scale: number,
) {
  if (!seats.length) return { x: 0, y: 0 };
  return {
    x: Math.max(0, Math.min(...seats.map((seat) => seat.x)) - viewport[0] - 48) * scale,
    y: Math.max(0, Math.min(...seats.map((seat) => seat.y)) - viewport[1] - 32) * scale,
  };
}

export function hideOccupiedPlaceholders(xml: string, hosts: Iterable<string>) {
  const occupied = new Set(hosts);
  return xml.replace(
    /<rect\b([^>]*?)\/>\s*<text\b[^>]*>[\s\S]*?<\/text>/gi,
    (match, attributes) => {
      const id = attributes.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
      return id && occupied.has(hostId(id)) ? "" : match;
    },
  );
}

export function parseMap(xml: string) {
  // Official maps contain commented seat examples and sometimes stray comment endings.
  xml = xml.replace(/<!--[\s\S]*?-->/g, "").replace(/-->/g, "");
  const box = xml
    .match(/viewBox\s*=\s*["']([^"']+)["']/i)?.[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!box || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) {
    throw new Error("This cluster map has an unsupported size.");
  }
  const seats = Array.from(xml.matchAll(/<image\b([^>]*?)(?:\/\s*>|>[\s\S]*?<\/image>)/gi)).flatMap(
    (match) => {
      const attributes = Object.fromEntries(
        Array.from(match[1].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g), (item) => [
          item[1],
          item[2],
        ]),
      );
      const { id } = attributes;
      const [x, y, width, height] = ["x", "y", "width", "height"].map((key) =>
        Number(attributes[key]),
      );
      if (!id || ![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0)
        return [];
      return [{ id: hostId(id), x, y, width, height }];
    },
  );
  return {
    box,
    seats,
    // Seat images are rendered as native interactive views above the static map.
    xml: xml.replace(/<image\b[^>]*(?:\/\s*>|>[\s\S]*?<\/image>)/gi, ""),
  };
}
