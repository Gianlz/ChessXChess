import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

const APP_NAME = 'ChessXChess'
const APP_DESCRIPTION = 'A collaborative chess game where everyone takes turns. Join the queue, make your move, and enjoy jazz music while playing!'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://chessxchess.vercel.app'

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} - Collaborative Chess`,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: ['chess', 'multiplayer', 'collaborative', 'game', 'real-time', 'online chess', 'queue chess'],
  authors: [{ name: 'ChessXChess Team' }],
  creator: 'ChessXChess',
  publisher: 'ChessXChess',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(APP_URL),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: APP_URL,
    siteName: APP_NAME,
    title: `${APP_NAME} - Collaborative Chess`,
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} - Collaborative Chess`,
    description: APP_DESCRIPTION,
    creator: '@chessxchess',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#b58863' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <div className="animated-bg" aria-hidden="true" />
        {children}
      </body>
    </html>
  )
}
