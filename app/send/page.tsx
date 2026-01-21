'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Upload, Copy, Share2, ArrowLeft } from 'lucide-react'
import { Button } from '@/src/components/ui/button'
import { Card } from '@/src/components/ui/card'
import { Input } from '@/src/components/ui/input'
import { toast } from 'sonner'
import { QRCodeSVG } from 'qrcode.react'
import { useFileTransfer } from '@/src/hooks/useFileTransfer'
import { Progress } from '@/src/components/ui/progress'
import { Header } from '@/src/components/Header'
import { useDropzone } from 'react-dropzone'

export default function SendPage() {
    const { uploadFiles, uploading, uploadProgress } = useFileTransfer()
    const [files, setFiles] = useState<File[]>([])
    const [code, setCode] = useState('')
    const [customCode, setCustomCode] = useState('')

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop: (acceptedFiles) => {
            setFiles(acceptedFiles)
        },
        disabled: uploading || !!code,
    })

    const handleShare = async () => {
        if (files.length === 0) {
            toast.error('Please select at least one file')
            return
        }

        const result = await uploadFiles(files, customCode || undefined, 24)
        if (result) {
            setCode(result.shareCode)
            toast.success('Files shared successfully!')
        }
    }

    const copyCode = () => {
        navigator.clipboard.writeText(code)
        toast.success('Code copied to clipboard!')
    }

    const copyLink = () => {
        if (!code) {
            toast.error('Share code not ready yet. Please wait a moment.')
            return
        }
        const link = `${window.location.origin}/receive?code=${encodeURIComponent(code)}`
        navigator.clipboard.writeText(link)
        toast.success('Link copied to clipboard!')
    }

    const shareUrl = code ? `${window.location.origin}/receive?code=${encodeURIComponent(code)}` : ''

    return (
        <div className="min-h-screen flex flex-col">
            <Header />

            <div className="flex-1 flex items-center justify-center p-4 md:p-6">
                <div className="w-full max-w-xl">
                    <div className="mb-4 md:mb-6">
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
                            Send Files
                        </h1>
                        <p className="text-sm md:text-base text-muted-foreground">
                            Upload files and share them with a simple code
                        </p>
                    </div>

                    <Card className="p-4 md:p-6">
                        {uploading ? (
                            <div className="space-y-4">
                                <div className="text-center">
                                    <div className="animate-spin mx-auto mb-4 h-8 w-8 border-2 border-foreground border-t-transparent rounded-full" />
                                    <h3 className="text-lg font-semibold mb-2">Uploading Files...</h3>
                                    <Progress value={uploadProgress} className="w-full mb-2" />
                                    <p className="text-sm text-muted-foreground">{uploadProgress}% complete</p>
                                </div>
                            </div>
                        ) : !code ? (
                            <>
                                <div
                                    {...getRootProps()}
                                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                                        }`}
                                >
                                    <input {...getInputProps()} />
                                    <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                                    {isDragActive ? (
                                        <p className="text-lg">Drop files here...</p>
                                    ) : (
                                        <>
                                            <p className="text-lg font-medium mb-2">
                                                Drag & drop files here
                                            </p>
                                            <p className="text-sm text-muted-foreground mb-4">
                                                or click to browse
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                Max 100MB per file, up to 10 files
                                            </p>
                                        </>
                                    )}
                                </div>

                                {files.length > 0 && (
                                    <div className="mt-4 space-y-2">
                                        <p className="text-sm font-medium">Selected Files:</p>
                                        {files.map((file, index) => (
                                            <div
                                                key={index}
                                                className="text-sm bg-muted p-2 rounded flex justify-between items-center"
                                            >
                                                <span className="truncate">{file.name}</span>
                                                <span className="text-muted-foreground ml-2">
                                                    {(file.size / 1024 / 1024).toFixed(2)} MB
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="mt-4">
                                    <label className="block text-sm font-medium mb-2">
                                        Custom Code (Optional)
                                    </label>
                                    <Input
                                        placeholder="Enter custom code (6+ characters)"
                                        value={customCode}
                                        onChange={(e) => setCustomCode(e.target.value.trim().toUpperCase())}
                                        className="text-center tracking-wider"
                                        maxLength={20}
                                    />
                                </div>

                                <Button
                                    onClick={handleShare}
                                    disabled={files.length === 0 || uploading}
                                    className="w-full mt-4"
                                    size="lg"
                                >
                                    <Upload className="mr-2 h-5 w-5" />
                                    Share Files
                                </Button>
                            </>
                        ) : (
                            <div className="space-y-4">
                                <div className="bg-primary text-primary-foreground p-6 rounded-lg text-center">
                                    <p className="text-xs mb-2 opacity-90">Share Code</p>
                                    <div className="text-3xl font-bold tracking-wider mb-4">{code}</div>
                                    <div className="flex gap-2 justify-center flex-wrap">
                                        <Button variant="secondary" size="sm" onClick={copyCode}>
                                            <Copy className="h-4 w-4 mr-2" />
                                            Copy Code
                                        </Button>
                                        <Button variant="secondary" size="sm" onClick={copyLink}>
                                            <Copy className="h-4 w-4 mr-2" />
                                            Copy Link
                                        </Button>
                                    </div>
                                </div>

                                <div className="bg-card border rounded-lg p-6 flex flex-col items-center space-y-3">
                                    <QRCodeSVG id="share-qr-svg" value={shareUrl} size={180} level="H" />
                                    <p className="text-xs text-muted-foreground text-center">
                                        Scan to download files
                                    </p>
                                </div>

                                <div className="text-center pt-2">
                                    <Button
                                        variant="ghost"
                                        onClick={() => {
                                            setFiles([])
                                            setCode('')
                                            setCustomCode('')
                                        }}
                                    >
                                        Share Different Files
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Card>

                    <div className="text-center mt-6">
                        <Button variant="ghost" asChild className="text-muted-foreground">
                            <Link href="/quickshare">Want to share text instead?</Link>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
