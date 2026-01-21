import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
    title: 'Share Anywhere - Secure File & Text Sharing',
    description: 'Share files, text, and links securely with anyone, anywhere. Fast, encrypted, and easy to use.',
    keywords: ['file sharing', 'text sharing', 'secure transfer', 'QR code', 'peer to peer'],
    authors: [{ name: 'Share Anywhere Team' }],
    viewport: 'width=device-width, initial-scale=1',
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: 'white' },
        { media: '(prefers-color-scheme: dark)', color: 'black' },
    ],
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={inter.className}>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
                    {children}
                    <Toaster />
                </ThemeProvider>
            </body>
        </html>
    )
}
