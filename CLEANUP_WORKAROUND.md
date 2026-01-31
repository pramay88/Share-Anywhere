# Cleanup Workaround for Vercel Hobby Plan

Since Vercel Hobby (free) plan doesn't support cron jobs, you have two options for automated cleanup:

## Option 1: Manual Cleanup (Recommended for Free Plan)

Call the cleanup endpoint manually when needed:

```bash
curl -X POST https://your-app.vercel.app/api/cleanup/expired \
  -H "X-API-Key: 066057b0ac4478abe0e9cf752445c97c48d23b96ea710af3f5e7add6a00b4712"
```

## Option 2: External Cron Service (Free)

Use a free external service to trigger cleanup:

### Using cron-job.org (Free)

1. Go to [cron-job.org](https://cron-job.org)
2. Create free account
3. Create new cron job:
   - **URL:** `https://your-app.vercel.app/api/cleanup/expired`
   - **Schedule:** Every 6 hours (`0 */6 * * *`)
   - **Method:** POST
   - **Headers:** Add `X-API-Key: 066057b0ac4478abe0e9cf752445c97c48d23b96ea710af3f5e7add6a00b4712`

### Using EasyCron (Free)

1. Go to [easycron.com](https://www.easycron.com)
2. Create free account (up to 100 tasks)
3. Add new cron job:
   - **URL:** `https://your-app.vercel.app/api/cleanup/expired`
   - **Cron Expression:** `0 */6 * * *`
   - **HTTP Method:** POST
   - **Custom Headers:** `X-API-Key: 066057b0ac4478abe0e9cf752445c97c48d23b96ea710af3f5e7add6a00b4712`

## Option 3: Upgrade to Vercel Pro

If you need built-in cron support:
- Vercel Pro: $20/month
- Includes unlimited cron jobs
- Better performance and limits

## Note

The cleanup endpoint is still available and working. You just need to trigger it externally instead of using Vercel's built-in cron.

**Shares will still expire after 24 hours** - the cleanup just removes them from the database and Cloudinary to save storage.
