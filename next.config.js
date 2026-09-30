const nextConfig = {
    async rewrites() {
        return [
            { source: "/", destination: "/index.html" },
            { source: "/login", destination: "/index.html" },
            { source: "/admin", destination: "/index.html" },
            { source: "/moderation", destination: "/index.html" },
        ];
    },
};
export default nextConfig;
