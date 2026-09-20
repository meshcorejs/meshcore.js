import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { appName, siteUrl } from '@/lib/shared';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: appName, template: `%s | ${appName}` },
  description:
    'Plug a LoRa radio into Node.js and write a bot the way you would with commands, events, jobs, permissions and roles.',
  applicationName: appName,
  keywords: ['meshcore', 'lora', 'mesh', 'bot', 'companion radio', 'typescript', 'node.js'],
  authors: [{ name: 'Théo Lagache', url: 'https://github.com/asuniia' }],
  creator: 'Théo Lagache',
  category: 'technology',
  alternates: { canonical: './' },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large' } },
  verification: { google: '8ibFHS_TEBQd14gKxVHFr0coysVfMGcwOr9iMPTyPpE' },
  openGraph: {
    type: 'website',
    siteName: appName,
    title: appName,
    description:
      'Plug a LoRa radio into Node.js and write a bot the way you would with commands, events, jobs, permissions and roles.',
    url: siteUrl,
    locale: 'en',
    images: '/og/image.png',
  },
  twitter: {
    card: 'summary_large_image',
    title: appName,
    description:
      'Plug a LoRa radio into Node.js and write a bot the way you would with commands, events, jobs, permissions and roles.',
    images: '/og/image.png',
  },
};

const inter = Inter({
  subsets: ['latin'],
});

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider search={{ options: { type: 'static' } }}>{children}</RootProvider>
      </body>
    </html>
  );
}
