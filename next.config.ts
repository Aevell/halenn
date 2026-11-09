import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep local comparison screenshots free of the development-tools badge.
  devIndicators: false,
  async headers() {
    // Email clients load these public, licensed fonts from another origin.
    return ["Manrope-Light.ttf", "Geist-Regular.ttf"].map((font) => ({
      source: `/brand/email/${font}`,
      headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
    }));
  },
};

export default nextConfig;
