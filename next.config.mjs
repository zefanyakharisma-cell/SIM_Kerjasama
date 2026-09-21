/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
    // Signed PDFs and Word drafts go through Server Actions; the 1 MB default is too small.
    serverActions: { bodySizeLimit: "20mb" },
  },
  // Lint is its own gate (`npm run lint`), not a build gate. ESLint was never
  // configured here, so the codebase carries a backlog of untyped Supabase row
  // shapes; letting that block `next build` would block deploys on style.
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
