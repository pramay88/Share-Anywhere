'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { type ThemeProviderProps } from 'next-themes/dist/types'
import { Toaster } from '@/components/ui/sonner'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
    return (
        <NextThemesProvider {...props}>
            {children}
            <Toaster />
        </NextThemesProvider>
    )
}
