/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    resolveAlias: {
      '@mediapipe/pose': './stubs/mediapipe-pose.js',
    },
  },
};

export default nextConfig;
