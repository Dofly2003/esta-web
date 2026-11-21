import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin hanya dipakai di server dan tidak perlu di-bundle
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
