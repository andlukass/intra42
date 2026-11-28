import { pathToFileURL } from "node:url";
import { db } from "./store.ts";

const projects = [
  {
    id: 101,
    name: "Byte Garden",
    slug: "byte-garden",
    state: "done",
    hours: 12,
    xp: 500,
    x: 360,
    y: 360,
    prerequisites: [],
    description: "Build a small library for byte buffers and text operations.",
  },
  {
    id: 102,
    name: "Signal Relay",
    slug: "signal-relay",
    state: "in_progress",
    hours: 25,
    xp: 1200,
    x: 360,
    y: 207,
    prerequisites: [101],
    description: "Implement a message relay and test how it behaves when clients reconnect.",
  },
  {
    id: 103,
    name: "Pocket Shell",
    slug: "pocket-shell",
    state: "available",
    hours: 48,
    xp: 2100,
    x: 227,
    y: 436,
    prerequisites: [101],
    description: "Write a small command interpreter with pipes and redirection.",
  },
  {
    id: 104,
    name: "Orbit Notes",
    slug: "orbit-notes",
    state: "available",
    hours: 32,
    xp: 1550,
    x: 493,
    y: 436,
    prerequisites: [101],
    description: "Create a local notes service with tags, search, and an import command.",
  },
  {
    id: 105,
    name: "Echo Index",
    slug: "echo-index",
    state: "unavailable",
    hours: 56,
    xp: 2700,
    x: 120,
    y: 505,
    prerequisites: [103],
    description: "Design an indexer for a collection of text documents.",
  },
  {
    id: 106,
    name: "Canvas Sync",
    slug: "canvas-sync",
    state: "not_recommended",
    hours: 64,
    xp: 3000,
    x: 600,
    y: 505,
    prerequisites: [104],
    description: "Prototype a drawing board that merges offline edits.",
  },
  {
    id: 107,
    name: "Packet Lab",
    slug: "packet-lab",
    state: "available",
    hours: 36,
    xp: 1700,
    x: 360,
    y: 72,
    prerequisites: [102],
    description: "Build a parser for a fictional transport protocol and validate malformed input.",
  },
] as const;

const students = [
  {
    id: 2,
    login: "acourvai",
    displayname: "Alice Courvaix",
    level: 4.2,
    location: "c1r1s2",
    completedProjectIds: [101, 102, 104],
  },
  {
    id: 3,
    login: "jbrissel",
    displayname: "Jules Brissel",
    level: 3.5,
    completedProjectIds: [101, 103, 105],
  },
  {
    id: 4,
    login: "nverlain",
    displayname: "Nina Verlaine",
    level: 5.1,
    completedProjectIds: [101, 102, 107],
  },
  {
    id: 5,
    login: "lrochem",
    displayname: "Louis Rochemont",
    level: 4.1,
    completedProjectIds: [101, 103, 104],
  },
  {
    id: 6,
    login: "mclairet",
    displayname: "Manon Clairet",
    level: 3.9,
    completedProjectIds: [101, 104, 106],
  },
  {
    id: 7,
    login: "ehartfen",
    displayname: "Eleanor Hartfen",
    level: 5.4,
    completedProjectIds: [101, 102, 103, 107],
  },
  {
    id: 8,
    login: "nashford",
    displayname: "Noah Ashford",
    level: 4.7,
    completedProjectIds: [101, 102, 104, 106],
  },
  {
    id: 9,
    login: "osherwel",
    displayname: "Oliver Sherwell",
    level: 3.2,
    completedProjectIds: [101, 102, 103],
  },
  {
    id: 10,
    login: "mwhitlan",
    displayname: "Maya Whitland",
    level: 4.8,
    completedProjectIds: [101, 103, 104, 105],
  },
  {
    id: 11,
    login: "rbramwel",
    displayname: "Rowan Bramwell",
    level: 5.2,
    completedProjectIds: [101, 102, 103, 104],
  },
];

function reviewFixtures() {
  const evaluations = [
    {
      id: 201,
      evaluator: 1,
      student: 2,
      project: 101,
      mark: 100,
      rating: 5,
      daysAgo: 2,
      comment: "The buffer tests passed, including empty input and boundary cases.",
      feedback: "The walkthrough helped me understand the edge cases.",
    },
    {
      id: 202,
      evaluator: 1,
      student: 3,
      project: 103,
      mark: 90,
      rating: 4,
      daysAgo: 4,
      comment: "Pipes worked well. Review error handling for missing commands.",
      feedback: "I appreciated the concrete examples.",
    },
    {
      id: 203,
      evaluator: 2,
      student: 1,
      project: 101,
      mark: 100,
      rating: 5,
      daysAgo: 6,
      comment: "Clear explanations and good test coverage.",
      feedback: "Thanks for checking the tests with me.",
    },
    {
      id: 204,
      evaluator: 3,
      student: 4,
      project: 104,
      mark: 95,
      rating: 5,
      daysAgo: 3,
      comment: "Search and tags work well. Document the import format.",
      feedback: "The review made the next steps clear.",
    },
  ];
  for (const [index, student] of students.entries()) {
    for (const [order, project] of student.completedProjectIds.entries()) {
      if (evaluations.some((entry) => entry.student === student.id && entry.project === project))
        continue;
      evaluations.push({
        id: student.id * 1000 + project,
        evaluator: students[(index + order + 1) % students.length].id,
        student: student.id,
        project,
        mark: 85 + ((student.id + order * 3) % 16),
        rating: 5,
        daysAgo: 12 + student.completedProjectIds.length - order,
        comment: "The solution passed the required checks.",
        feedback: "The review clarified how to improve the solution.",
      });
    }
  }
  return {
    students: students.map((student) => ({
      ...student,
      completedAt: new Date(Date.now() - (student.id + 7) * 86_400_000).toISOString(),
    })),
    studentFixtureVersion: 3,
    evaluations: evaluations.map(({ daysAgo, ...evaluation }) => ({
      ...evaluation,
      begin_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    })),
  };
}

export type ReviewFixtures = ReturnType<typeof reviewFixtures>;
export type ReviewProject = (typeof projects)[number];
export const catalog = db.doc("review/catalog");

export async function seedCatalog(replace = false) {
  if (replace) {
    await catalog.set({ projects, ...reviewFixtures() });
    return;
  }
  await db.runTransaction(async (transaction) => {
    const saved = await transaction.get(catalog);
    if (!saved.exists) transaction.create(catalog, { projects, ...reviewFixtures() });
    else if (saved.get("studentFixtureVersion") !== 3 || !saved.get("evaluations"))
      transaction.set(catalog, reviewFixtures(), { merge: true });
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    await seedCatalog(true);
    console.log(
      `Seeded ${projects.length} fictional projects, their graph layout, profiles and feedback.`,
    );
  } finally {
    await db.terminate();
  }
}
