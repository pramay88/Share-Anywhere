'use client'

import { Header } from '@/src/components/Header'
import { QuickShareForm } from '@/src/components/QuickShareForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card'

export default function QuickSharePage() {
    return (
        <div className="min-h-screen flex flex-col">
            <Header />

            <main className="flex-1 container max-w-2xl mx-auto py-8 px-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Quick Share</CardTitle>
                        <CardDescription>
                            Share text, links, or code snippets instantly with a simple code
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <QuickShareForm />
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}
