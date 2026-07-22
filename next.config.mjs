/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep TypeScript type-checking on during builds (catches real bugs),
  // but don't let lint style rules block a production deploy.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
