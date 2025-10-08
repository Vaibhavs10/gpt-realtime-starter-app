const allowedDevOrigins = process.env.NEXT_DEV_ALLOWED_ORIGINS
  ? process.env.NEXT_DEV_ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : undefined;

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins:
    allowedDevOrigins && allowedDevOrigins.length > 0
      ? allowedDevOrigins
      : undefined,
};

export default nextConfig;
