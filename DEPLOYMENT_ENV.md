# Environment Variables for Vercel

Copy these to Vercel Dashboard → Settings → Environment Variables

## Required Variables

### API Security
```
API_SECRET_KEY=<GENERATE_NEW_KEY_FOR_PRODUCTION>
```

**How to generate:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Cloudinary Configuration
```
CLOUDINARY_CLOUD_NAME=dv0pcv3zg
CLOUDINARY_API_KEY=823617948917771
CLOUDINARY_API_SECRET=XNUjRzm19zpsachEIYvBhJV0lgw
```

### Firebase Admin SDK
```
FIREBASE_SERVICE_ACCOUNT_KEY=<BASE64_ENCODED_SERVICE_ACCOUNT_JSON>
```

**How to encode properly:**
```powershell
# On Windows PowerShell
$json = Get-Content "path/to/firebase-service-account.json" -Raw
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
$base64 = [Convert]::ToBase64String($bytes)
echo $base64
```

### Application Configuration
```
APP_URL=https://your-app.vercel.app
NODE_ENV=production
```

**Note:** Replace `your-app.vercel.app` with your actual Vercel deployment URL after first deployment.

## Deployment Steps

1. ✅ Code pushed to GitHub
2. ⏳ Deploy to Vercel
3. ⏳ Add environment variables
4. ⏳ Redeploy to apply env vars
5. ⏳ Test production API

## Quick Deploy Commands

```bash
# Install Vercel CLI (if not installed)
npm i -g vercel

# Deploy to production
vercel --prod

# Check deployment status
vercel ls
```

## Verification Checklist

After deployment, verify:

- [ ] Health check: `https://your-app.vercel.app/api/health`
- [ ] Frontend loads: `https://your-app.vercel.app`
- [ ] Cron job is scheduled in Vercel dashboard
- [ ] Environment variables are set
- [ ] Test share creation with API key
- [ ] Test share retrieval
- [ ] Test file download redirect

## Important Notes

⚠️ **Security:**
- Generate a NEW `API_SECRET_KEY` for production (don't use dev key)
- Never commit environment variables to Git
- Keep API key secure in Chrome extension

⚠️ **Firebase:**
- Ensure service account JSON is properly base64 encoded
- No escaped newlines (`\n`) in the encoded string

⚠️ **Cloudinary:**
- Verify credentials are from your Cloudinary dashboard
- Check usage limits on free tier (25GB/month)

## Support

If deployment fails:
1. Check Vercel function logs
2. Verify all environment variables are set
3. Ensure Firebase key is properly encoded
4. Review deployment guide for troubleshooting
