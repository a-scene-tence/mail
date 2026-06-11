/** @type {import('next').NextConfig} */
const nextConfig = {
  // 앱인토스는 SSR을 금지한다. 반드시 정적 export를 유지할 것.
  output: 'export',
  images: { unoptimized: true },
  // 정적 export 환경에서 trailingSlash가 라우팅 안정성에 도움.
  trailingSlash: true,
};

export default nextConfig;
