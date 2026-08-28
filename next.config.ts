import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 y sqlite-vec cargan binarios nativos (.node/.dll) que
  // Turbopack/webpack no pueden bundlear: deben quedar como require() real
  // en el runtime de Node del servidor.
  serverExternalPackages: [
    "better-sqlite3",
    "sqlite-vec",
    "sqlite-vec-windows-x64",
    "@xenova/transformers",
  ],
};

export default nextConfig;
