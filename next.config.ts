import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  poweredByHeader: false,
  typedRoutes: true,
  // PLAN-001 5a: AVIF con WebP de respaldo (el navegador elige el mejor).
  images: { formats: ['image/avif', 'image/webp'] },
  turbopack: {
    root: process.cwd(),
  },
};

export default config;
