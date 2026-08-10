import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'static-cdn.jtvnw.net',
      },
      {
        protocol: 'https',
        hostname: 'inumamiya-stream.vercel.app',
      },
      {
        protocol: 'https',
        hostname: 'api.qrserver.com',
      },
    ],
  },

  turbopack: {
    root: path.resolve(process.cwd(), "../.."),
  },
};

export default nextConfig;