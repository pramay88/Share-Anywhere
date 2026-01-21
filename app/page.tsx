'use client'

import Link from 'next/link'
import {
    Upload,
    Download,
    Zap,
    ArrowRight,
} from 'lucide-react'
import { Button } from '@/src/components/ui/button'
import { Header } from '@/src/components/Header'

export default function HomePage() {
    return (
        <div className="min-h-screen flex flex-col">
            <Header />

            {/* Hero Section */}
            <section className="flex-1 flex flex-col justify-center items-center text-center py-20 px-6">
                <div className="max-w-4xl mx-auto space-y-8">
                    <div className="space-y-4">
                        <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight">
                            Share Files & Text Instantly
                        </h1>

                        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
                            Transfer files up to 100MB or share text snippets with just a code or QR scan.
                            No signup required.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                        <Button
                            size="lg"
                            asChild
                            className="group"
                        >
                            <Link href="/send">
                                <Upload className="mr-2 h-4 w-4" />
                                Send Files
                                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                            </Link>
                        </Button>
                        <Button
                            size="lg"
                            variant="outline"
                            asChild
                        >
                            <Link href="/quickshare">
                                <Zap className="mr-2 h-4 w-4" />
                                Quick Share Text
                            </Link>
                        </Button>
                        <Button
                            size="lg"
                            variant="outline"
                            asChild
                        >
                            <Link href="/receive">
                                <Download className="mr-2 h-4 w-4" />
                                Receive
                            </Link>
                        </Button>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto pt-12">
                        <div className="text-center space-y-1">
                            <div className="text-3xl md:text-4xl font-bold">100MB</div>
                            <div className="text-sm text-muted-foreground">Max Size</div>
                        </div>
                        <div className="text-center space-y-1">
                            <div className="text-3xl md:text-4xl font-bold">24h</div>
                            <div className="text-sm text-muted-foreground">Retention</div>
                        </div>
                        <div className="text-center space-y-1">
                            <div className="text-3xl md:text-4xl font-bold">Free</div>
                            <div className="text-sm text-muted-foreground">Forever</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-6 px-6 border-t text-center">
                <p className="text-sm text-muted-foreground">
                    © {new Date().getFullYear()} ShareAnywhere
                </p>
            </footer>
        </div>
    )
}
