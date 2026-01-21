import { NextRequest, NextResponse } from 'next/server';
import {
    getTransferByCode,
    incrementConsumeCount,
    logDownload
} from '@/lib/server/firebase/firestore';
import { validateAndSanitizeCode, validateRequest, consumeShareSchema } from '@/lib/server/middleware/validation';
import { getUserIdFromRequest } from '@/lib/server/middleware/auth';
import { rateLimiters } from '@/lib/server/middleware/rateLimit';
import { ErrorCode, TransferFile } from '@/lib/shared/types';

async function handleConsumeShare(
    req: NextRequest,
    { params }: { params: { code: string } }
) {
    try {
        const code = params.code;

        // Validate code format
        const codeValidation = validateAndSanitizeCode(code);
        if (!codeValidation.valid) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: ErrorCode.INVALID_CODE_FORMAT,
                        message: codeValidation.error,
                    },
                },
                { status: 400 }
            );
        }

        // Parse request body
        const body = await req.json();
        const validation = validateRequest(consumeShareSchema, body);

        if (!validation.valid) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: ErrorCode.INTERNAL_ERROR,
                        message: validation.error,
                    },
                },
                { status: 400 }
            );
        }

        // Get transfer from database
        const result = await getTransferByCode(codeValidation.code!);

        if (!result) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: ErrorCode.SHARE_NOT_FOUND,
                        message: 'Share not found. Please check the code and try again.',
                    },
                },
                { status: 404 }
            );
        }

        const { transfer, files } = result;

        // Get user ID (optional)
        const userId = await getUserIdFromRequest(req);
        const userAgent = req.headers.get('user-agent') || 'unknown';

        // Handle file download
        if (validation.data!.fileId) {
            const file = files.find((f: TransferFile) => f.id === validation.data!.fileId);

            if (!file) {
                return NextResponse.json(
                    {
                        success: false,
                        error: {
                            code: ErrorCode.FILE_NOT_FOUND,
                            message: 'File not found in this share.',
                        },
                    },
                    { status: 404 }
                );
            }

            // Log download
            await logDownload({
                transferId: transfer.id,
                fileId: file.id,
                downloadedBy: userId,
                userAgent,
            });

            // Increment consume count
            const consumeCount = await incrementConsumeCount(transfer.id);

            return NextResponse.json({
                success: true,
                data: {
                    downloadUrl: file.cloudinaryUrl,
                    consumeCount,
                },
            });
        }

        // Handle text/URL share
        if (transfer.contentType === 'text' || transfer.contentType === 'url') {
            // Increment consume count
            const consumeCount = await incrementConsumeCount(transfer.id);

            return NextResponse.json({
                success: true,
                data: {
                    textContent: transfer.textContent,
                    consumeCount,
                },
            });
        }

        // No fileId provided for file share
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: ErrorCode.INTERNAL_ERROR,
                    message: 'File ID required for file downloads.',
                },
            },
            { status: 400 }
        );
    } catch (error: any) {
        console.error('Error consuming share:', error);

        if (error.message.includes('expired')) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: ErrorCode.SHARE_EXPIRED,
                        message: error.message,
                    },
                },
                { status: 410 }
            );
        }

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: ErrorCode.INTERNAL_ERROR,
                    message: 'Failed to consume share. Please try again.',
                },
            },
            { status: 500 }
        );
    }
}

export const POST = rateLimiters.consumeShare(handleConsumeShare);
