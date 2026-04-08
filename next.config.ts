import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Убирает предупреждение при открытии dev с 127.0.0.1 вместо localhost */
  allowedDevOrigins: ["http://127.0.0.1:3000", "http://localhost:3000"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
      { protocol: "https", hostname: "storage-cdn10.gloria-jeans.ru", pathname: "/**" },
    ],
  },
};

export default nextConfig;
