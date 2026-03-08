import type { NextConfig } from "next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  basePath: "/audio-viz",
  assetPrefix: "/audio-viz/",
};

module.exports = nextConfig;