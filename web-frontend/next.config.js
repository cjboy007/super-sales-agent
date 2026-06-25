/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.devtool = false
    }

    return config
  },
}

module.exports = nextConfig
