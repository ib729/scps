import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	/* config options here */
	output: "standalone",
	allowedDevOrigins: ['stuco.ivanbelousov.com', '*.stuco.ivanbelousov.com'],
};

export default nextConfig;
