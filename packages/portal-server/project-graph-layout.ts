type Point = [number, number];
type Edge = [number, number, number, number];
type Node = {
  id: number;
  slug: string;
  name: string;
  kind: string;
  x: number;
  y: number;
  state: string;
  description?: string;
  duration?: string;
  edges: Edge[];
};
type Slot = string | { linked: string[] } | { satellites: string[] };
type Variant = "default" | "42next";
const center: Point = [3000, 3000];
const outerRadius = 1000;
const angles = [0, 0, 75, -65, 150, -150, 50];
const rings: Record<Variant, Slot[][]> = {
  default: [
    ["42cursus-libft"],
    ["42cursus-get_next_line", "42cursus-ft_printf", "born2beroot"],
    [
      { linked: ["42cursus-fract-ol", "42cursus-fdf", "so_long"] },
      { linked: ["minitalk", "pipex"] },
      "42cursus-push_swap",
      "ft_server",
      "exam-rank-02",
    ],
    ["42cursus-philosophers", "42cursus-minishell", "exam-rank-03"],
    [
      {
        satellites: [
          "cpp-module-00",
          "cpp-module-01",
          "cpp-module-02",
          "cpp-module-03",
          "cpp-module-04",
        ],
      },
      { linked: ["minirt", "cub3d"] },
      "netpractice",
      "exam-rank-04",
    ],
    [
      { linked: ["webserv", "ft_irc"] },
      {
        satellites: [
          "cpp-module-05",
          "cpp-module-06",
          "cpp-module-07",
          "cpp-module-08",
          "cpp-module-09",
        ],
      },
      "inception",
      "exam-rank-05",
    ],
    ["ft_transcendence", "42_collaborative_resume", "exam-rank-06"],
  ],
  "42next": [
    ["42cursus-libft"],
    ["42cursus-get_next_line", "42cursus-ft_printf", "42next-push_swap"],
    [
      "42next-born2beroot",
      "42next-exam-rank-02",
      {
        satellites: [
          "python-module-00",
          "python-module-01",
          "python-module-02",
          "python-module-03",
          "python-module-04",
        ],
      },
      {
        satellites: [
          "python-module-05-bis",
          "python-module-06-bis",
          "python-module-09",
          "python-module-10",
        ],
      },
      {
        satellites: [
          "python-module-05",
          "python-module-06",
          "python-module-07",
          "python-module-08",
        ],
      },
      "a-maze-ing",
    ],
    ["42next-exam-rank-03", "codexion", "fly-in", "call-me-maybe"],
    ["42next-exam-rank-04", "rag-against-the-machine", "pac-man", "netpractice"],
    [
      "42next-exam-rank-05",
      { linked: ["agent-smith", "tree_nity"] },
      "the-answer-protocol",
      "inception",
    ],
    ["ft_transcendence", "42_collaborative_resume", "42next-exam-rank-06"],
  ],
};

export const graphVariants = [
  ["42cursus-push_swap", "42next-push_swap"],
  ["born2beroot", "42next-born2beroot"],
  ...["02", "03", "04", "05", "06"].map((rank) => [
    `exam-rank-${rank}`,
    `42next-exam-rank-${rank}`,
  ]),
];

function pointAt([x, y]: Point, radius: number, angle: number): Point {
  return [x + radius * Math.sin(angle), y + radius * Math.cos(angle)];
}

function readPoints(value: unknown, node: Point, origins: Map<number, Point>): Edge[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const points = entry?.points;
    if (!Array.isArray(points) || points.length !== 2) {
      const origin = origins.get(typeof entry === "number" ? entry : entry?.id);
      return origin ? [[...origin, ...node]] : [];
    }
    const [from, to] = points;
    if (
      !Array.isArray(from) ||
      from.length !== 2 ||
      !Array.isArray(to) ||
      to.length !== 2 ||
      ![...from, ...to].every(Number.isFinite)
    )
      return [];
    return [[from[0], from[1], to[0], to[1]]];
  });
}

function isInCore(x: number, y: number) {
  return Math.hypot(x - center[0], y - center[1]) <= outerRadius;
}

function ringBoundary([x, y]: Point, [endX, endY]: Point): Point {
  const dx = endX - x;
  const dy = endY - y;
  const offsetX = x - center[0];
  const offsetY = y - center[1];
  const lengthSquared = dx * dx + dy * dy;
  const projection = offsetX * dx + offsetY * dy;
  const radiusSquared = offsetX * offsetX + offsetY * offsetY - outerRadius * outerRadius;
  const fraction =
    (-projection -
      Math.sqrt(Math.max(0, projection * projection - lengthSquared * radiusSquared))) /
    lengthSquared;
  return [x + fraction * dx, y + fraction * dy];
}

function clipCore([x1, y1, x2, y2]: Edge): Edge[] {
  const first = isInCore(x1, y1);
  const second = isInCore(x2, y2);
  if (first && second) return [];
  if (first) return [[...ringBoundary([x2, y2], [x1, y1]), x2, y2]];
  if (second) return [[x1, y1, ...ringBoundary([x1, y1], [x2, y2])]];
  return [[x1, y1, x2, y2]];
}

function ringState(states: string[]) {
  if (states.every((state) => state === "done")) return "done";
  if (states.every((state) => state === "available")) return "available";
  if (states.every((state) => state === "fail")) return "fail";
  return states.some((state) => state === "done" || state === "in_progress")
    ? "in_progress"
    : "unavailable";
}

export function buildProjectGraph(data: unknown, cursus: string, variant: Variant) {
  if (!Array.isArray(data)) throw new Error("42 returned invalid project graph data.");
  const origins = new Map<number, Point>(
    data.flatMap((row) =>
      Number.isSafeInteger(row?.id) && Number.isFinite(row.x) && Number.isFinite(row.y)
        ? [[row.id, [row.x, row.y]]]
        : [],
    ),
  );
  const projects = new Map<string, Node>();
  for (const row of data) {
    if (
      !Number.isSafeInteger(row?.project_id) ||
      row.project_id <= 0 ||
      typeof row.name !== "string" ||
      typeof row.slug !== "string" ||
      !/^[a-z0-9_-]+$/i.test(row.slug) ||
      !Number.isFinite(row.x) ||
      !Number.isFinite(row.y)
    )
      continue;
    projects.set(row.slug, {
      id: row.project_id,
      slug: row.slug,
      name: row.name.trim(),
      x: row.x,
      y: row.y,
      kind: typeof row.kind === "string" ? row.kind : "project",
      state: typeof row.state === "string" ? row.state : "",
      description: typeof row.description === "string" ? row.description.trim() : undefined,
      duration: typeof row.duration === "string" ? row.duration.trim() : undefined,
      edges: readPoints(row.by, [row.x, row.y], origins),
    });
  }

  const positions = new Map<number, Node>();
  const edges: Edge[] = [];
  const graphRings: { x: number; y: number; radius: number; state: string }[] = [];
  const hasCore = cursus === "21";
  const place = (project: Node, [x, y]: Point, kind: string, state = project.state) => {
    positions.set(project.id, { ...project, x, y, kind, state });
  };
  const addLink = (edge: Edge) => {
    if (edge[0] === edge[2] && edge[1] === edge[3]) return;
    edges.push(...(hasCore ? clipCore(edge) : [edge]));
  };

  for (const project of projects.values()) {
    const { x, y } = project;
    if ((x === 0 && y === 0) || (hasCore && isInCore(x, y))) continue;
    positions.set(project.id, project);
    for (const edge of project.edges) addLink(edge);
  }
  if (hasCore) {
    const alternates = new Map(
      graphVariants.map(([classic, next]) =>
        variant === "42next" ? [next, classic] : [classic, next],
      ),
    );
    for (const [index, slots] of rings[variant].entries()) {
      const radius = (outerRadius * index) / (angles.length - 1);
      const states: string[] = [];
      for (const [slotIndex, slot] of slots.entries()) {
        const angle = (angles[index] * Math.PI) / 180 + (2 * Math.PI * slotIndex) / slots.length;
        const position = pointAt(center, radius, angle);
        if (typeof slot === "string") {
          const original = projects.get(slot);
          const alternateSlug = alternates.get(slot);
          const alternate = alternateSlug ? projects.get(alternateSlug) : undefined;
          const needsAlternate = !original || ["available", "unavailable"].includes(original.state);
          const project =
            needsAlternate && alternate && ["done", "fail"].includes(alternate.state)
              ? alternate
              : original;
          states.push(project?.state ?? "unavailable");
          if (project) {
            const kind = slot.includes("exam-rank")
              ? "exam"
              : slot === "ft_transcendence"
                ? "large"
                : "project";
            place(project, position, kind);
          }
        } else if ("satellites" in slot) {
          for (const [offset, slug] of slot.satellites.entries()) {
            const project = projects.get(slug);
            if (project) {
              place(
                project,
                pointAt(
                  position,
                  75,
                  Math.PI / 5 + (2 * Math.PI * offset) / slot.satellites.length,
                ),
                "satellite",
              );
            }
          }
          states.push("unavailable");
        } else {
          const projectsInSlot = slot.linked.map((slug) => projects.get(slug));
          const winner = projectsInSlot.find((project) => project?.state === "done");
          const step = Math.asin(50 / radius);
          for (const [offset, project] of projectsInSlot.entries()) {
            if (!project) continue;
            const coords = pointAt(
              center,
              radius,
              angle + (2 * offset - projectsInSlot.length + 1) * step,
            );
            place(
              project,
              coords,
              "linked",
              winner && project !== winner ? "unavailable" : project.state,
            );
          }
          const groupStates = new Set(projectsInSlot.map((project) => project?.state));
          states.push(
            ["done", "in_progress", "available", "fail"].find((state) => groupStates.has(state)) ??
              "unavailable",
          );
        }
      }
      if (index) graphRings.push({ x: center[0], y: center[1], radius, state: ringState(states) });
    }
  }
  const nodes = [...positions.values()].map(
    ({ id, name, slug, x, y, kind, description, duration }) => ({
      id,
      name,
      slug,
      x,
      y,
      kind,
      ...(kind === "exam" && { description, duration }),
    }),
  );
  const states = [...positions.values()].map(({ id, state }) => ({ id, state }));
  return { variant: hasCore ? variant : "piscine", nodes, edges, rings: graphRings, states };
}
