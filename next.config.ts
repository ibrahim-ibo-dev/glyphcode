import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static export: the app is a set of files, no server needed.
  // Generation and scanning run 100% in the browser.
  output: "export",
};

export default nextConfig;
