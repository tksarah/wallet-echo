import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  outputFileTracingExcludes: { '/*': ['.env*', '.secrets/**', '.data/**', 'artifacts/**', 'sites-wallet-echo/**', 'output/**', '.git/**', 'admin_pw.txt', '*_Jev.txt', '*_PubFi.txt', 'tests/**', 'scripts/**'] },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }];
  },
};
export default config;
