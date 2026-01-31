# Firebase Setup Guide

## Issue
Your Firebase service account credentials are not configured, causing the API to fail.

## Quick Fix

### Option 1: Add Firebase Credentials (Recommended for Production)

1. **Get your Firebase service account key:**
   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate New Private Key"
   - Download the JSON file

2. **Convert to base64:**
   ```bash
   # On Windows PowerShell:
   [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content -Raw path\to\serviceAccountKey.json)))
   
   # On Mac/Linux:
   base64 -i path/to/serviceAccountKey.json
   ```

3. **Add to `.env.local`:**
   ```
   FIREBASE_SERVICE_ACCOUNT_KEY=<your-base64-encoded-key>
   ```

4. **Restart your dev server**

### Option 2: Disable Firebase Temporarily (For Testing)

If you just want to test the UI without Firebase:

1. Create a mock Firebase service in `src/lib/server/firebase/firestore.ts`
2. Return mock data instead of calling Firebase

## Error Details

The error occurs because:
- Firebase Admin SDK tries to initialize on first API call
- `FIREBASE_SERVICE_ACCOUNT_KEY` environment variable is missing or invalid
- Next.js catches the error and returns an HTML error page
- Frontend tries to parse HTML as JSON → SyntaxError

## What I Fixed

✅ Added better error handling to return JSON errors instead of HTML
✅ Improved error logging to show full error details
✅ Added specific error message for Firebase configuration issues

Now you'll see a clear error message instead of a JSON parsing error!
