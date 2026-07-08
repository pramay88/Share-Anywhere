import { v2 as cloudinary } from 'cloudinary';
import { db } from '../../../../_lib/firebase-admin.js';

const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const canSignUrls = Boolean(apiSecret || process.env.CLOUDINARY_URL);
const isProduction = process.env.NODE_ENV === 'production';

cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
});

function getSingleQueryValue(value) {
    return Array.isArray(value) ? value[0] : value;
}

function inferCloudinaryDelivery(cloudinaryUrl, mimeType) {
    const parsed = typeof cloudinaryUrl === 'string'
        ? cloudinaryUrl.match(/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/(upload|private|authenticated)\//)
        : null;

    if (parsed) {
        return {
            resourceType: parsed[1],
            deliveryType: parsed[2],
        };
    }

    if (mimeType?.startsWith('image/')) {
        return { resourceType: 'image', deliveryType: 'upload' };
    }

    if (mimeType?.startsWith('video/') || mimeType?.startsWith('audio/')) {
        return { resourceType: 'video', deliveryType: 'upload' };
    }

    return { resourceType: 'raw', deliveryType: 'upload' };
}

function extractCloudName(cloudinaryUrl) {
    const parsed = typeof cloudinaryUrl === 'string'
        ? cloudinaryUrl.match(/res\.cloudinary\.com\/([^/]+)\//)
        : null;
    return parsed?.[1] || cloudName || null;
}

function getSignedCloudinaryUrl(file) {
    const { resourceType, deliveryType } = inferCloudinaryDelivery(file.cloudinary_url, file.mime_type);
    const isPdf = file.mime_type === 'application/pdf' || file.original_name?.toLowerCase?.().endsWith('.pdf');
    const resolvedCloudName = extractCloudName(file.cloudinary_url);

    if (!file.cloudinary_public_id) {
        return file.cloudinary_url;
    }

    if (deliveryType !== 'upload' && !canSignUrls) {
        throw new Error('Cloudinary API secret is required for protected file downloads.');
    }
    if (!resolvedCloudName) {
        throw new Error('Cloudinary cloud name is not configured and could not be inferred.');
    }

    const shouldSignUrl = canSignUrls && (deliveryType !== 'upload' || isPdf);

    return cloudinary.url(file.cloudinary_public_id, {
        cloud_name: resolvedCloudName,
        secure: true,
        sign_url: shouldSignUrl,
        resource_type: resourceType,
        type: deliveryType,
    });
}

function buildCandidateDownloadUrls(file) {
    const candidates = [];
    const isPdf = file.mime_type === 'application/pdf' || file.original_name?.toLowerCase?.().endsWith('.pdf');
    const resolvedCloudName = extractCloudName(file.cloudinary_url);

    if (file.cloudinary_url) {
        candidates.push(file.cloudinary_url);
    }

    if (!file.cloudinary_public_id || !resolvedCloudName) {
        return candidates;
    }

    candidates.push(getSignedCloudinaryUrl(file));

    if (isPdf) {
        candidates.push(cloudinary.url(file.cloudinary_public_id, {
            cloud_name: resolvedCloudName,
            secure: true,
            sign_url: canSignUrls,
            resource_type: 'raw',
            type: 'upload',
            format: 'pdf',
        }));
        candidates.push(cloudinary.url(file.cloudinary_public_id, {
            cloud_name: resolvedCloudName,
            secure: true,
            sign_url: canSignUrls,
            resource_type: 'image',
            type: 'upload',
            format: 'pdf',
        }));
        candidates.push(cloudinary.url(file.cloudinary_public_id, {
            cloud_name: resolvedCloudName,
            secure: true,
            sign_url: canSignUrls,
            resource_type: 'raw',
            type: 'authenticated',
            format: 'pdf',
        }));
        candidates.push(cloudinary.url(file.cloudinary_public_id, {
            cloud_name: resolvedCloudName,
            secure: true,
            sign_url: canSignUrls,
            resource_type: 'raw',
            type: 'private',
            format: 'pdf',
        }));
        candidates.push(cloudinary.url(file.cloudinary_public_id, {
            cloud_name: resolvedCloudName,
            secure: true,
            sign_url: canSignUrls,
            resource_type: 'image',
            type: 'authenticated',
            format: 'pdf',
        }));
        candidates.push(cloudinary.url(file.cloudinary_public_id, {
            cloud_name: resolvedCloudName,
            secure: true,
            sign_url: canSignUrls,
            resource_type: 'image',
            type: 'private',
            format: 'pdf',
        }));

        if (canSignUrls) {
            candidates.push(cloudinary.utils.private_download_url(
                file.cloudinary_public_id,
                'pdf',
                {
                    resource_type: 'raw',
                    type: 'upload',
                    attachment: true,
                    expires_at: Math.floor(Date.now() / 1000) + 300,
                }
            ));
        }
    }

    return Array.from(new Set(candidates.filter(Boolean)));
}

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const transferId = getSingleQueryValue(req.query.transferId);
        const fileId = getSingleQueryValue(req.query.fileId);

        if (!transferId || !fileId) {
            return res.status(400).json({ error: 'Missing transfer or file id' });
        }

        const transferRef = db.collection('transfers').doc(transferId);
        const [transferDoc, fileDoc] = await Promise.all([
            transferRef.get(),
            transferRef.collection('files').doc(fileId).get(),
        ]);

        if (!transferDoc.exists || !fileDoc.exists) {
            return res.status(404).json({ error: 'File not found' });
        }

        const transfer = transferDoc.data();
        const file = fileDoc.data();

        if (transfer.expires_at?.toDate && transfer.expires_at.toDate() < new Date()) {
            return res.status(410).json({ error: 'This transfer has expired' });
        }

        const candidateUrls = buildCandidateDownloadUrls(file);
        if (candidateUrls.length === 0) {
            return res.status(404).json({ error: 'Download URL not available' });
        }
        let upstreamResponse = null;
        let lastStatus = 502;
        for (const url of candidateUrls) {
            const attempt = await fetch(url);
            if (attempt.ok) {
                upstreamResponse = attempt;
                break;
            }
            lastStatus = attempt.status;
        }

        if (!upstreamResponse) {
            return res.status(lastStatus).json({ error: 'Failed to fetch file from storage' });
        }

        const contentType = upstreamResponse.headers.get('content-type')
            || file.mime_type
            || 'application/octet-stream';
        const contentLength = upstreamResponse.headers.get('content-length');
        const safeFileName = (file.original_name || 'download').replace(/"/g, '\\"');
        const buffer = Buffer.from(await upstreamResponse.arrayBuffer());

        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Content-Type', contentType);
        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }
        res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
        return res.status(200).send(buffer);
    } catch (error) {
        console.error('Transfer file download failed:', error);
        res.status(500).json({
            error: 'Failed to prepare download',
            details: isProduction ? undefined : error.message,
        });
    }
}
