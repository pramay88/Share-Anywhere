# ShareAnywhere API Documentation

Complete API reference for the ShareAnywhere file sharing backend.

## Base URL

- **Production:** `https://share-anywhere.vercel.app/api`
- **Development:** `http://localhost:3001/api`

## Authentication

Most endpoints require API key authentication via the `X-API-Key` header.

```bash
X-API-Key: your-api-key-here
```

## Rate Limiting

- **Protected endpoints:** 10 requests per 15 minutes per IP
- **Public endpoints:** 100 requests per 15 minutes per IP

---

## Endpoints

### 1. Health Check

Check API status and service availability.

**Endpoint:** `GET /health`

**Authentication:** None

**Response:**
```json
{
  "success": true,
  "message": "ShareAnywhere API is running",
  "timestamp": "2026-01-31T14:30:00.000Z"
}
```

**Example:**
```bash
curl https://share-anywhere.vercel.app/api/health
```

---

### 2. Create Share

Generate a signed upload URL for direct Cloudinary uploads.

**Endpoint:** `POST /shares/create`

**Authentication:** Required (`X-API-Key`)

**Request Body:**
```json
{
  "contentType": "file",
  "fileName": "document.pdf",
  "fileSize": 1048576,
  "customCode": "MYCUSTOM",
  "expiresInHours": 24
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contentType` | string | Yes | Type of content: `"file"` or `"text"` |
| `fileName` | string | Yes (for files) | Original filename |
| `fileSize` | number | Yes (for files) | File size in bytes |
| `customCode` | string | No | Custom 6+ character share code |
| `expiresInHours` | number | No | Expiry time (default: 24 hours) |

**Response:**
```json
{
  "success": true,
  "shareCode": "ABC123",
  "uploadUrl": "https://api.cloudinary.com/v1_1/.../upload",
  "uploadParams": {
    "public_id": "shares/abc123_1234567890",
    "timestamp": 1234567890,
    "signature": "..."
  },
  "expiresAt": "2026-02-01T14:30:00.000Z"
}
```

**Example:**
```bash
curl -X POST https://share-anywhere.vercel.app/api/shares/create \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "contentType": "file",
    "fileName": "report.pdf",
    "fileSize": 2048576
  }'
```

---

### 3. Complete Share

Finalize share after successful Cloudinary upload.

**Endpoint:** `POST /shares/:code/complete`

**Authentication:** Required (`X-API-Key`)

**URL Parameters:**
| Parameter | Description |
|-----------|-------------|
| `code` | Share code from create endpoint |

**Request Body:**
```json
{
  "publicId": "shares/abc123_1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Share completed successfully",
  "shareCode": "ABC123",
  "shareUrl": "https://share-anywhere.vercel.app/receive?code=ABC123"
}
```

**Example:**
```bash
curl -X POST https://share-anywhere.vercel.app/api/shares/ABC123/complete \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "publicId": "shares/abc123_1234567890"
  }'
```

---

### 4. Get Share Metadata

Retrieve share information without downloading.

**Endpoint:** `GET /shares/:code`

**Authentication:** None

**URL Parameters:**
| Parameter | Description |
|-----------|-------------|
| `code` | Share code |

**Response:**
```json
{
  "success": true,
  "share": {
    "code": "ABC123",
    "contentType": "file",
    "files": [
      {
        "fileName": "document.pdf",
        "fileSize": 1048576,
        "publicId": "shares/abc123_1234567890"
      }
    ],
    "expiresAt": "2026-02-01T14:30:00.000Z",
    "status": "ready",
    "createdAt": "2026-01-31T14:30:00.000Z"
  }
}
```

**Example:**
```bash
curl https://share-anywhere.vercel.app/api/shares/ABC123
```

---

### 5. Download File

Get redirect URL to Cloudinary CDN for file download.

**Endpoint:** `GET /shares/:code/download`

**Authentication:** None

**URL Parameters:**
| Parameter | Description |
|-----------|-------------|
| `code` | Share code |

**Response:** `302 Redirect` to Cloudinary CDN URL

**Example:**
```bash
curl -L https://share-anywhere.vercel.app/api/shares/ABC123/download
```

---

### 6. Consume Share

Mark share as consumed (for single-use shares).

**Endpoint:** `POST /shares/:code/consume`

**Authentication:** None

**URL Parameters:**
| Parameter | Description |
|-----------|-------------|
| `code` | Share code |

**Response:**
```json
{
  "success": true,
  "message": "Share consumed successfully"
}
```

**Example:**
```bash
curl -X POST https://share-anywhere.vercel.app/api/shares/ABC123/consume
```

---

### 7. Cleanup Expired Shares

Remove expired shares from database and Cloudinary (Cron job endpoint).

**Endpoint:** `POST /cleanup/expired`

**Authentication:** Required (`X-API-Key`)

**Response:**
```json
{
  "success": true,
  "cleaned": 15,
  "message": "Cleaned up 15 expired shares"
}
```

**Example:**
```bash
curl -X POST https://share-anywhere.vercel.app/api/cleanup/expired \
  -H "X-API-Key: your-api-key"
```

---

## Complete Upload Flow

### Step 1: Create Share
```bash
# Request signed upload URL
curl -X POST https://share-anywhere.vercel.app/api/shares/create \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "contentType": "file",
    "fileName": "photo.jpg",
    "fileSize": 524288
  }'
```

### Step 2: Upload to Cloudinary
```bash
# Upload file directly to Cloudinary using signed URL
curl -X POST "https://api.cloudinary.com/v1_1/your-cloud/upload" \
  -F "file=@photo.jpg" \
  -F "public_id=shares/abc123_1234567890" \
  -F "timestamp=1234567890" \
  -F "signature=..."
```

### Step 3: Complete Share
```bash
# Finalize the share
curl -X POST https://share-anywhere.vercel.app/api/shares/ABC123/complete \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "publicId": "shares/abc123_1234567890"
  }'
```

### Step 4: Share Link
```
https://share-anywhere.vercel.app/receive?code=ABC123
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

### Common Error Codes

| Status Code | Description |
|-------------|-------------|
| `400` | Bad Request - Invalid parameters |
| `401` | Unauthorized - Missing or invalid API key |
| `404` | Not Found - Share code doesn't exist |
| `429` | Too Many Requests - Rate limit exceeded |
| `500` | Internal Server Error |

---

## Share Status

Shares can have the following statuses:

| Status | Description |
|--------|-------------|
| `pending` | Share created, waiting for file upload |
| `ready` | File uploaded and ready to download |
| `expired` | Share has expired (24 hours passed) |
| `consumed` | Share has been downloaded (single-use) |

---

## Environment Variables

Required environment variables for the API:

```env
# API Security
API_SECRET_KEY=your-secret-key-here

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Firebase
FIREBASE_SERVICE_ACCOUNT_KEY=base64-encoded-json

# App Configuration
APP_URL=https://share-anywhere.vercel.app
NODE_ENV=production
```

---

## SDK Examples

### JavaScript/TypeScript

```typescript
const API_BASE_URL = 'https://share-anywhere.vercel.app/api';
const API_KEY = 'your-api-key';

// Create share
async function createShare(file: File) {
  const response = await fetch(`${API_BASE_URL}/shares/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({
      contentType: 'file',
      fileName: file.name,
      fileSize: file.size,
    }),
  });
  
  return response.json();
}

// Upload to Cloudinary
async function uploadToCloudinary(file: File, uploadUrl: string, params: any) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('public_id', params.public_id);
  formData.append('timestamp', params.timestamp);
  formData.append('signature', params.signature);
  
  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });
  
  return response.json();
}

// Complete share
async function completeShare(code: string, publicId: string) {
  const response = await fetch(`${API_BASE_URL}/shares/${code}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({ publicId }),
  });
  
  return response.json();
}
```

### Python

```python
import requests

API_BASE_URL = 'https://share-anywhere.vercel.app/api'
API_KEY = 'your-api-key'

# Create share
def create_share(file_name, file_size):
    response = requests.post(
        f'{API_BASE_URL}/shares/create',
        headers={
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
        },
        json={
            'contentType': 'file',
            'fileName': file_name,
            'fileSize': file_size,
        }
    )
    return response.json()

# Get share metadata
def get_share(code):
    response = requests.get(f'{API_BASE_URL}/shares/{code}')
    return response.json()

# Download file
def download_file(code):
    response = requests.get(
        f'{API_BASE_URL}/shares/{code}/download',
        allow_redirects=True
    )
    return response.content
```

---

## Webhooks (Future)

Webhook support is planned for future releases to notify your application of:
- Share expiration
- File downloads
- Share consumption

---

## Support

For issues or questions:
- GitHub: [pramay88/Share-Anywhere](https://github.com/pramay88/Share-Anywhere)
- Email: pramaywankhade7@gmail.com

---

**Last Updated:** January 31, 2026  
**API Version:** 1.0.0
