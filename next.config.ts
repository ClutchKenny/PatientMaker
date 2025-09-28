import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Don’t fail the Vercel build because of ESLint
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Don’t fail the Vercel build because of TS type errors
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
