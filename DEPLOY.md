# ShareAnywhere - Production Deployment

## 🎯 Quick Start

Your project is **ready to deploy**! Follow these steps:

### 1. Deploy to Vercel

**Option A: Vercel Dashboard (Recommended)**
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import `pramay88/Share-Anywhere` repository
3. Select branch: `feature/backend-api`
4. Click **Deploy**

**Option B: Vercel CLI**
```bash
npm i -g vercel
vercel --prod
```

### 2. Configure Environment Variables

Go to Vercel Dashboard → Your Project → Settings → Environment Variables

**Generate Production API Key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Add these variables:**
- `API_SECRET_KEY` = (generated key above)
- `CLOUDINARY_CLOUD_NAME` = `dv0pcv3zg`
- `CLOUDINARY_API_KEY` = `823617948917771`
- `CLOUDINARY_API_SECRET` = `XNUjRzm19zpsachEIYvBhJV0lgw`
- `FIREBASE_SERVICE_ACCOUNT_KEY` = (see encoding instructions below)
- `APP_URL` = `https://your-app.vercel.app`
- `NODE_ENV` = `production`

**Encode Firebase Service Account:**
```powershell
$json = Get-Content "path/to/firebase-service-account.json" -Raw
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
$base64 = [Convert]::ToBase64String($bytes)
echo $base64
```

### 3. Redeploy

After adding environment variables:
- Vercel Dashboard → Deployments → Latest → Redeploy

### 4. Verify

Test your deployment:
```bash
curl https://your-app.vercel.app/api/health
```

Expected response:
```json
{"success":true,"message":"ShareAnywhere API is running"}
```

## 📋 What's Deployed

✅ **Frontend:** React + Vite + TailwindCSS
✅ **Backend API:** Express.js with direct Cloudinary uploads
✅ **Database:** Firebase Firestore (metadata only)
✅ **CDN:** Cloudinary (file storage & delivery)
✅ **Cron Job:** Automated cleanup every 6 hours
✅ **Security:** API key validation + rate limiting

## 🔗 API Endpoints

- `GET /api/health` - Health check
- `POST /api/shares/create` - Create share (requires API key)
- `POST /api/shares/:code/complete` - Complete upload (requires API key)
- `GET /api/shares/:code` - Get share metadata
- `GET /api/shares/:code/download` - Download file (redirect to CDN)
- `POST /api/shares/:code/consume` - Mark as consumed
- `POST /api/cleanup/expired` - Cleanup (cron, requires API key)

## 🚀 Next Steps

1. **Test Production API**
   - Create a text share
   - Upload a file via Chrome extension
   - Test download redirect

2. **Monitor Usage**
   - Cloudinary: Dashboard → Usage
   - Firebase: Console → Usage
   - Vercel: Dashboard → Analytics

3. **Build Chrome Extension**
   - Update API endpoint to production URL
   - Use production API key
   - Test file uploads

## 📚 Documentation

- [Deployment Guide](./DEPLOYMENT_ENV.md) - Detailed deployment instructions
- [API Documentation](../brain/.../walkthrough.md) - Complete API reference
- [Implementation Plan](../brain/.../implementation_plan.md) - Architecture details

## ⚠️ Important

- **API Key:** Generate NEW key for production (don't reuse dev key)
- **Firebase:** Ensure service account is properly base64 encoded
- **Secrets:** Never commit `.env.local` or encode scripts to Git
- **Monitoring:** Check Vercel logs for any errors

## 🆘 Troubleshooting

**Firebase Error:**
- Re-encode service account JSON (no escaped newlines)

**Cloudinary Error:**
- Verify all 3 Cloudinary env vars are set

**API Key Error:**
- Ensure API_SECRET_KEY matches in Vercel and Chrome extension

**Cron Not Running:**
- Check Vercel Dashboard → Cron Jobs
- Verify path is `/api/cleanup/expired`

---

**Status:** ✅ Ready for production deployment
**Branch:** `feature/backend-api`
**Last Updated:** 2026-01-31
