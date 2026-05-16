import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  /** Ensure Prisma engines and generated client are present in standalone output. */
  outputFileTracingIncludes: {
    "/*": ["./node_modules/.prisma/**/*", "./node_modules/@prisma/client/**/*"],
  },
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
