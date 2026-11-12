import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // @libsql/client و MCP SDK تُبقى خارج حزمة البناء (حزم Node خالصة تصل عبر HTTP)
  serverExternalPackages: ["@libsql/client", "libsql"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
