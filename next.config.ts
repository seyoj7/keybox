import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: "dist/next",

  serverExternalPackages: ["sql.js", "hash-wasm"],
};

export default nextConfig;
