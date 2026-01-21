import { NextRequest, NextResponse } from 'next/server';
import { isShareCodeUnique, getTransferByCode } from '@/lib/server/firebase/firestore';
import { validateAndSanitizeCode } from '@/lib/server/middleware/validation';
import { ErrorCode } from '@/lib/shared/types';

export async function GET(
    req: NextRequest,
    { params }: { params: { code: string } }
) {
    try {
        const code = params.code;

        // Validate code format
        const codeValidation = validateAndSanitizeCode(code);
        if (!codeValidation.valid) {
            return NextResponse.json({
                success: true,
                data: {
                    isValid: false,
                    exists: false,
                    isExpired: false,
                    isAvailable: false,
                },
            });
        }

        // Check if code exists
        const exists = !(await isShareCodeUnique(codeValidation.code!));

        if (!exists) {
            return NextResponse.json({
                success: true,
                data: {
                    isValid: true,
                    exists: false,
                    isExpired: false,
                    isAvailable: false,
                },
            });
        }

        // Get transfer to check expiry
        try {
            const result = await getTransferByCode(codeValidation.code!);

            if (!result) {
                return NextResponse.json({
                    success: true,
                    data: {
                        isValid: true,
                        exists: false,
                        isExpired: false,
                        isAvailable: false,
                    },
                });
            }

            const isExpired = result.transfer.expiresAt
                ? new Date(result.transfer.expiresAt) < new Date()
                : false;

            return NextResponse.json({
                success: true,
                data: {
                    isValid: true,
                    exists: true,
                    isExpired,
                    isAvailable: !isExpired,
                },
            });
        } catch (error: any) {
            // If error is about expiry, the share exists but is expired
            if (error.message.includes('expired')) {
                return NextResponse.json({
                    success: true,
                    data: {
                        isValid: true,
                        exists: true,
                        isExpired: true,
                        isAvailable: false,
                    },
                });
            }

            throw error;
        }
    } catch (error) {
        console.error('Error validating code:', error);

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: ErrorCode.INTERNAL_ERROR,
                    message: 'Failed to validate code. Please try again.',
                },
            },
            { status: 500 }
        );
    }
}
