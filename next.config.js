/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Linting is run separately; don't block builds on it for this MVP pass.
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ['better-sqlite3'],
};

module.exports = nextConfig;
