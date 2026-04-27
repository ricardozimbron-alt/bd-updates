/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared @bdu/lib package contains TS source files; transpile from
  // node_modules during build instead of pre-compiling it.
  transpilePackages: ['@bdu/lib'],

  // The monorepo lives in the parent of the Next.js app. Tell tracing to
  // walk the workspace root so it can pick up @bdu/lib and the Prisma
  // engine binaries that live under ../lib/src/generated/prisma/.
  outputFileTracingRoot: new URL('..', import.meta.url).pathname,
  // Vercel serverless functions run on RHEL — the .so.node binary that
  // Prisma needs must be packaged with the function. Without this,
  // Next.js's bundler tree-shakes it out and runtime fails with
  // "Prisma Client could not locate the Query Engine for runtime
  // 'rhel-openssl-3.0.x'".
  outputFileTracingIncludes: {
    '/**/*': [
      '../lib/src/generated/prisma/**/*',
      '../node_modules/.pnpm/@prisma+client*/**/libquery_engine*',
      '../node_modules/.pnpm/@prisma+engines*/**/libquery_engine*',
    ],
  },
  // Don't bundle Prisma client into the serverless function — let it stay
  // an external Node import so the binary loader works.
  serverExternalPackages: ['@prisma/client', '.prisma/client'],

  webpack(config) {
    // Internal imports inside @bdu/lib use ESM `.js` specifiers (per Node ESM
    // convention) but resolve to `.ts` source files. Tell webpack to handle.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};
export default nextConfig;
// cache-bust 1777287013
