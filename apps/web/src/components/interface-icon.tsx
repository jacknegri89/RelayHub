const paths = {
  account: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8c1-4 4-6 8-6s7 2 8 6",
  overview: "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z",
  sources: "M3 12h11m-4-4 4 4-4 4m5-12h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4",
  destinations:
    "M3 6h3c5 0 5 12 10 12h4m-3-3 3 3-3 3M6 6c5 0 5 0 10 0h4m-3-3 3 3-3 3",
  events: "M3 12h4l3-8 4 16 3-8h4",
  deliveries: "M3 11 21 3l-6 18-4-7-8-3Zm8 3L21 3",
  alerts: "M5 16h14l-2-3V9a5 5 0 0 0-10 0v4l-2 3Zm5 3a2 2 0 0 0 4 0",
  settings: "M3 6h7m4 0h7M3 12h2m4 0h12M3 18h10m4 0h4M10 4v4m-5 2v4m8 2v4",
  workspace: "M3 21V6l11-3v18M2 21h20m-8-11h6v11M7 8h3m-3 4h3m-3 4h3",
  guide: "M3 5c3-1 6-1 9 1 3-2 6-2 9-1v13c-3-1-6-1-9 1-3-2-6-2-9-1V5Zm9 1v13",
  security: "m12 3 8 3v5c0 5-3 8-8 11-5-3-8-6-8-11V6l8-3Zm-4 9 3 3 5-6",
  menu: "M3 6h18M3 12h18M3 18h18",
  switcher: "m9 9 3-3 3 3m-6 6 3 3 3-3",
  arrow: "M4 12h15m-6-6 6 6-6 6",
  arrowDown: "M12 4v15m-6-6 6 6 6-6",
} as const;

export type IconName = keyof typeof paths;

export function InterfaceIcon({ name }: { name: IconName }) {
  return (
    <svg
      className="interface-icon"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
