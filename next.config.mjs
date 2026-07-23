/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: [
    "pdf-parse",
    "ws",
    "bufferutil",
    "utf-8-validate",
  ],
};

export default nextConfig;
