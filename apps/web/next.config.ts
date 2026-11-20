import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@relayhub/db", "@relayhub/shared"],
  serverExternalPackages: ["pg", "@prisma/client", "@prisma/adapter-pg"],
  poweredByHeader: false,
  agentRules: false,
  async redirects() {
    const previous = process.env.RELAYHUB_PREVIOUS_ORIGIN;
    const current = process.env.RELAYHUB_BASE_URL;
    if (!previous || !current || previous === current) {
      return [];
    }
    const previousHost = new URL(previous).host.replaceAll(".", "\\.");
    // Keep API clients and saved webhook destinations on the old host working.
    return ["/", "/login", "/register", "/workspace/:path*"].map((source) => ({
      source,
      has: [{ type: "host", value: previousHost }],
      destination: current + source,
      permanent: false,
    }));
  },
  async headers() {
    let scripts = "'self' 'unsafe-inline'";
    if (process.env.NODE_ENV === "development") {
      scripts += " 'unsafe-eval'";
    }
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; script-src " +
              scripts +
              "; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default config;
