/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
    // Signed PDFs and Word drafts go through Server Actions; the 1 MB default is too small.
    serverActions: { bodySizeLimit: "20mb" },
  },
};
export default nextConfig;
