import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dev 모드 좌하단 표시기 숨김 (시연 화면에 노출되지 않게)
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.API_PROXY_TARGET ?? "http://localhost:8000"}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;