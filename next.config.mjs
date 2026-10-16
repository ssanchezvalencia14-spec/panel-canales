// En .mjs (no .ts): el hosting de Hostinger no carga los binarios nativos de
// Next por su glibc antigua y, sin ellos, no puede compilar un config en TS.

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/adapter-mariadb", "mariadb"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Nadie puede incrustar el panel en un iframe (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
