'use client'

import { redirect } from 'next/navigation'
import { useEffect } from 'react'

export default function HomePage() {
    useEffect(() => {
        // Redirect to the main index page
        redirect('/send')
    }, [])

    return null
}
