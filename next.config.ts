import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Образ Docker / Yandex Cloud Container Registry, VM, Kubernetes */
  output: "standalone",
  /** Убирает предупреждение при открытии dev с 127.0.0.1 вместо localhost */
  allowedDevOrigins: ["http://127.0.0.1:3000", "http://localhost:3000"],
  images: {
    /** Внешние URL товаров (админка / импорт). Основной сид использует локальный /product-placeholder.svg */
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
      { protocol: "https", hostname: "storage-cdn10.gloria-jeans.ru", pathname: "/**" },
    ],
    // GJ CDN медленно отвечает из dev — не проксируем через оптимизатор Next.js
    unoptimized: true,
  },
};

export default nextConfig;
