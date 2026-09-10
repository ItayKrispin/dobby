import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow ngrok (and similar tunnels) to load Next.js dev assets / HMR.
  // Without this, the dashboard HTML loads but client JS never hydrates,
  // so conversations stay stuck on "טוען שיחות...".
  allowedDevOrigins: [
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.ngrok.app",
  ],
};

export default nextConfig;
