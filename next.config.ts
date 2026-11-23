import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The embedded Postgres ships WASM and data files that must load from node_modules, not a bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  async rewrites() {
    // evra.world/@handle is every creator's public kit and link page.
    return [{ source: "/@:handle", destination: "/kit/:handle" }];
  },
};

export default nextConfig;
