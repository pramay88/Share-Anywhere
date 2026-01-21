import { NextRequest, NextResponse } from 'next/server';
import {
    createTransfer,
    addFileToTransfer,
    generateUniqueShareCode,
    isShareCodeUnique
} from '@/lib/server/firebase/firestore';
import {
    validateRequest,
    createShareSchema,
    validateFiles,
    validateTextContent,
    sanitizeText,
    validateAndSanitizeCode
} from '@/lib/server/middleware/validation';
import { getUserIdFromRequest } from '@/lib/server/middleware/auth';
import { rateLimiters } from '@/lib/server/middleware/rateLimit';
import { ErrorCode, DEFAULT_EXPIRY_HOURS } from '@/lib/shared/types';
import { APP_CONFIG } from '@/lib/shared/constants';

// Cloudinary upload function (simplified - you'll need to implement actual upload)
async function uploadToCloudinary(file: File, folder: string): Promise<{
    publicId: string;
    secureUrl: string;
}> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || '');
    formData.append('folder', folder);

    const response = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/upload`,
        {
            method: 'POST',
            body: formData,
        }
    );

    if (!response.ok) {
        throw new Error('Cloudinary upload failed');
    }

    const data = await response.json();
    return {
        publicId: data.public_id,
        secureUrl: data.secure_url,
    };
}

async function handleCreateShare(req: NextRequest) {
    try {
        // Get user ID (optional for anonymous shares)
        const userId = await getUserIdFromRequest(req);

        // Parse form data
        const formData = await req.formData();
        const contentType = formData.get('contentType') as string;
        const customCode = formData.get('customCode') as string | null;
        const expiresInHours = formData.get('expiresInHours')
            ? parseInt(formData.get('expiresInHours') as string)
            : DEFAULT_EXPIRY_HOURS;
        const content = formData.get('content') as string | null;

        // Validate content type
        if (!['file', 'text', 'url'].includes(contentType)) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: ErrorCode.INVALID_CONTENT_TYPE,
                        message: 'Invalid content type. Must be file, text, or url.',
                    },
                },
                { status: 400 }
            );
        }

        // Validate custom code if provided
        let shareCode: string;
        if (customCode) {
            const codeValidation = validateAndSanitizeCode(customCode);
            if (!codeValidation.valid) {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: ErrorCode.INVALID_CUSTOM_CODE,
                            message: codeValidation.error,
                        },
                    },
                    { status: 400 }
                );
            }

            // Check if code is unique
            const isUnique = await isShareCodeUnique(codeValidation.code!);
            if (!isUnique) {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: ErrorCode.CODE_ALREADY_IN_USE,
                            message: 'This code is already in use. Please choose another.',
                        },
                    },
                    { status: 409 }
                );
            }

            shareCode = codeValidation.code!;
        } else {
            // Generate unique code
            shareCode = await generateUniqueShareCode();
        }

        // Calculate expiration
        const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

        // Handle text/URL shares
        if (contentType === 'text' || contentType === 'url') {
            if (!content) {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: ErrorCode.INTERNAL_ERROR,
                            message: 'Content is required for text/url shares.',
                        },
                    },
                    { status: 400 }
                );
            }

            // Validate text content
            const textValidation = validateTextContent(content);
            if (!textValidation.valid) {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: ErrorCode.TEXT_TOO_LARGE,
                            message: textValidation.error,
                        },
                    },
                    { status: 400 }
                );
            }

            // Sanitize content
            const sanitizedContent = sanitizeText(content);

            // Create transfer
            const transferId = await createTransfer({
                shareCode,
                ownerId: userId,
                contentType,
                expiresAt,
                textContent: sanitizedContent,
                textMetadata: {
                    characterCount: sanitizedContent.length,
                },
            });

            const shareUrl = `${APP_CONFIG.APP_URL}/receive?code=${shareCode}`;

            return NextResponse.json({
                success: true,
                data: {
                    shareCode,
                    transferId,
                    qrCodeUrl: '', // Will be generated on frontend
                    shareUrl,
                    expiresAt: expiresAt.toISOString(),
                    createdAt: new Date().toISOString(),
                },
            });
        }

        // Handle file shares
        const files = formData.getAll('files') as File[];

        if (files.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: ErrorCode.INTERNAL_ERROR,
                        message: 'At least one file is required for file shares.',
                    },
                },
                { status: 400 }
            );
        }

        // Validate files
        const filesValidation = validateFiles(files);
        if (!filesValidation.valid) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: ErrorCode.FILE_TOO_LARGE,
                        message: filesValidation.error,
                    },
                },
                { status: 400 }
            );
        }

        // Create transfer
        const transferId = await createTransfer({
            shareCode,
            ownerId: userId,
            contentType: 'file',
            expiresAt,
        });

        // Upload files to Cloudinary
        for (const file of files) {
            try {
                const uploadResult = await uploadToCloudinary(file, `shareanywhere/${transferId}`);

                await addFileToTransfer(transferId, {
                    cloudinaryPublicId: uploadResult.publicId,
                    cloudinaryUrl: uploadResult.secureUrl,
                    originalName: file.name,
                    fileSize: file.size,
                    mimeType: file.type || 'application/octet-stream',
                });
            } catch (uploadError) {
                console.error('File upload error:', uploadError);
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: ErrorCode.UPLOAD_FAILED,
                            message: `Failed to upload file: ${file.name}`,
                        },
                    },
                    { status: 500 }
                );
            }
        }

        const shareUrl = `${APP_CONFIG.APP_URL}/receive?code=${shareCode}`;

        return NextResponse.json({
            success: true,
            data: {
                shareCode,
                transferId,
                qrCodeUrl: '', // Will be generated on frontend
                shareUrl,
                expiresAt: expiresAt.toISOString(),
                createdAt: new Date().toISOString(),
            },
        });
    } catch (error: any) {
        console.error('Error creating share:', error);

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: ErrorCode.INTERNAL_ERROR,
                    message: 'Failed to create share. Please try again.',
                    details: error.message,
                },
            },
            { status: 500 }
        );
    }
}

export const POST = rateLimiters.createShare(handleCreateShare);
