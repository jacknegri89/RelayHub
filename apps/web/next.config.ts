import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@relayhub/db", "@relayhub/shared"],
  serverExternalPackages: ["pg", "@prisma/client", "@prisma/adapter-pg"],
  poweredByHeader: false,
  agentRules: false,
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
