import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	/* config options here */
	output: "standalone",
	allowedDevOrigins: [
		"stuco.ivanbelousov.com",
		"*.stuco.ivanbelousov.com",
		"http://192.168.50.43:3000",
	],
	// Disable Fast Refresh in development to prevent automatic reloads
	reactStrictMode: false,
};

export default nextConfig;
