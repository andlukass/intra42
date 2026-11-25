const paths = {
  menu: "M3 6h18M3 12h18M3 18h18",
  "chevron-down": "m6 9 6 6 6-6",
  close: "m5 5 14 14M5 19 19 5",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2h16ZM12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  network:
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM10 10 5 6m9 4 5-4m-9 8-5 4m9-4 5 4M12 15v6M3 4h2v2H3zm16 0h2v2h-2zM3 18h2v2H3zm16 0h2v2h-2z",
  video: "M3 4h18v16H3zM3 8h18M3 16h18m-11-6 5 2-5 2Z",
  forum: "M13 15H7l-4 3v-5a6 6 0 1 1 10 2Zm1-5a6 6 0 0 1 7 8v4l-4-3h-2a6 6 0 0 1-4-2",
  briefcase: "M3 7h18v13H3zM8 7V4h8v3M3 12h18m-11 0v2h4v-2",
  compass: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4 6-2 6-6 2 2-6z",
  cart: "M2 3h3l3 12h11l3-8H6m4 13h.01M18 20h.01",
  search: "M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM16 16l5 5",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9Zm-8 12a2 2 0 0 0 4 0",
  calendar:
    "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2-3v6m10-6v6M3 10h18",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5v5l4 2",
  pin: "M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 0 1 16 0Zm-8-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  mail: "M3 5h18v14H3zm0 1 9 7 9-7",
  phone: "M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2C10 21 3 14 3 5a2 2 0 0 1 2-2Z",
  logout: "M10 3H4v18h6m-2-9h13m-5-5 5 5-5 5",
} as const;

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
