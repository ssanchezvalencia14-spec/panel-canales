// En .mjs (no .ts): el hosting de Hostinger no carga los binarios nativos de
// Next por su glibc antigua y, sin ellos, no puede compilar un config en TS.

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/adapter-mariadb", "mariadb"],
};

export default nextConfig;
