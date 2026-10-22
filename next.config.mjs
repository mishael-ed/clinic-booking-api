import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  turbopack: { root: path.resolve(import.meta.dirname) },
};

export default nextConfig;
