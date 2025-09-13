/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Ensure these files are traced into the serverless bundles
    outputFileTracingIncludes: {
      "app/api/chat/route": ["prompts/**/*", "schemas/**/*"],
      "app/api/selftest/route": ["prompts/**/*", "schemas/**/*"],
      "app/api/health/route": ["prompts/**/*"],
      "app/api/ping/route": []
    }
  }
};

module.exports = nextConfig;
