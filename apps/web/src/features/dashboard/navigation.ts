export const navigation = [
  { path: "/", title: "Home", icon: "user" },
  { path: "/projects", title: "Projects", icon: "network" },
  { path: "/elearning", title: "E-learning", icon: "video" },
  { path: "/forum", title: "Forum", icon: "forum" },
  { path: "/companies", title: "Companies", icon: "briefcase" },
  { path: "/meta", title: "Meta", icon: "compass" },
  { path: "/shop", title: "Shop", icon: "cart" },
] as const;

export const pages = [
  ...navigation.slice(1),
  { path: "/search", title: "Search" },
  { path: "/notifications", title: "Notifications" },
  { path: "/events", title: "All events" },
  { path: "/events/marks", title: "Event marks" },
  { path: "/feedbacks", title: "Feedback logs" },
  { path: "/achievements", title: "Achievements" },
  { path: "/alumni", title: "Alumni benefits" },
] as const;
