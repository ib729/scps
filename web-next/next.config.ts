import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	/* config options here */
	output: "standalone",
	allowedDevOrigins: [
		"scps.ivanbelousov.com",
		"*.scps.ivanbelousov.com",
		"http://192.168.50.43:3000",
	],
	// Disable Fast Refresh in development to prevent automatic reloads
	reactStrictMode: false,

	// Add security and SEO headers
	async headers() {
		return [
			{
				source: '/:path*',
				headers: [
					{
						key: 'X-Robots-Tag',
						value: 'noindex, nofollow', // Default: don't index
					},
					{
						key: 'X-DNS-Prefetch-Control',
						value: 'on',
					},
					{
						key: 'Content-Security-Policy',
						value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';",
					},
				],
			},
			{
				source: '/login',
				headers: [
					{
						key: 'X-Robots-Tag',
						value: 'index, follow', // Allow indexing login page
					},
				],
			},
		];
	},
};

export default nextConfig;
