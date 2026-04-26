/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared @bdu/lib package contains TS source files; transpile from
  // node_modules during build instead of pre-compiling it.
  transpilePackages: ['@bdu/lib'],
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
