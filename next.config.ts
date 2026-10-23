import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep local comparison screenshots free of the development-tools badge.
  devIndicators: false,
};

export default nextConfig;
