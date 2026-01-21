import { NextRequest, NextResponse } from 'next/server';
import {
    getTransferByCode,
    incrementConsumeCount,
    logDownload
} from '@/lib/server/firebase/firestore';
import { validateAndSanitizeCode } from '@/lib/server/middleware/validation';
import { getUserIdFromRequest } from '@/lib/server/middleware/auth';
import { rateLimiters } from '@/lib/server/middleware/rateLimit';
import { ErrorCode } from '@/lib/shared/types';

async function handleGetShare(
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

        return NextResponse.json({
            success: true,
            data: result,
        });
    } catch (error: any) {
        console.error('Error fetching share:', error);

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
                    message: 'Failed to fetch share. Please try again.',
                },
            },
            { status: 500 }
        );
    }
}

export const GET = rateLimiters.getShare(handleGetShare);
