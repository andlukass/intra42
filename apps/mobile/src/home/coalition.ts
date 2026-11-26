import type { Profile } from "../api";

export type Coalition = { id: number; name: string; color: string | null };
export type CoalitionBloc = {
  campus_id: number;
  cursus_id: number;
  coalitions: Coalition[];
};

export function coalitionsByCourse(memberships: Coalition[], blocs: CoalitionBloc[]) {
  const memberIds = new Set(memberships.map(({ id }) => id));
  const coalitions = new Map<number, Coalition>();
  for (const bloc of blocs) {
    if (coalitions.has(bloc.cursus_id)) continue;
    const coalition = bloc.coalitions.find(({ id }) => memberIds.has(id));
    if (coalition) coalitions.set(bloc.cursus_id, coalition);
  }
  return coalitions;
}

export function defaultProfileCourse(
  courses: NonNullable<Profile["cursus_users"]>,
  coalitions: ReadonlyMap<number, Coalition>,
) {
  // The public API lists the Piscine first even when the portal opens the Core.
  return (
    courses.find(({ cursus, level }) => cursus.slug === "42cursus" && level > 0) ??
    courses.find(({ cursus }) => coalitions.has(cursus.id)) ??
    courses[0]
  );
}

function mixHex(base: string, tint: string, amount: number) {
  const channels = [1, 3, 5].map((offset) => {
    const from = Number.parseInt(base.slice(offset, offset + 2), 16);
    const to = Number.parseInt(tint.slice(offset, offset + 2), 16);
    return Math.round(from + (to - from) * amount)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

export function profilePalette(color?: string | null) {
  const hex = color?.trim();
  const accent = hex && /^#[\da-f]{6}$/i.test(hex) ? hex.toLowerCase() : "#a0a9b7";
  return {
    accent,
    background: mixHex("#161c26", accent, 0.33),
    contact: mixHex(accent, "#ffffff", 0.36),
    skeleton: mixHex("#333333", accent, 0.55),
  };
}

export type ProfilePalette = ReturnType<typeof profilePalette>;
