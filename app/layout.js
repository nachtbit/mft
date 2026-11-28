import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import Script from 'next/script';
import './globals.css';

// Downloaded at build time and served by this app, not by Google.
const inter = Inter({ subsets: ['latin', 'latin-ext'], display: 'swap' });

export const metadata = { title: 'MFT', robots: { index: false, follow: false } };
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f9f9fb' };

export default async function RootLayout({ children }) {
  // Reading headers renders per request, which the CSP nonce requires.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body>
        {children}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
          nonce={nonce}
        />
      </body>
    </html>
  );
}
