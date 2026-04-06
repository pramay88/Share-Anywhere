/**
 * Admin Routes
 * Protected endpoints for admin dashboard metrics
 */

import express from 'express';
import { getAdmin, getFirestore } from '../config/firebase.js';

const router = express.Router();

// In-memory cache
let cache = {
  data: null,
  timestamp: 0,
};
const CACHE_TTL = 45 * 1000; // 45 seconds

// Admin email allowlist
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'pramaywankhade7@gmail.com')
  .split(',')
  .map(email => email.trim().toLowerCase());

/**
 * Verify Firebase ID token and check admin access
 */
async function verifyAdminAccess(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { authorized: false, error: 'Missing or invalid authorization header' };
  }

  const idToken = authHeader.split('Bearer ')[1];
  
  try {
    const admin = getAdmin();
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const email = decodedToken.email?.toLowerCase();
    
    if (!email || !ADMIN_EMAILS.includes(email)) {
      return { authorized: false, error: 'User is not authorized as admin' };
    }
    
    return { authorized: true, user: decodedToken };
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return { authorized: false, error: 'Invalid or expired token' };
  }
}

/**
 * Fetch Vercel project and user data
 */
async function fetchVercelData() {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID || 'share-anywhere';
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!token) {
    return { error: 'VERCEL_API_TOKEN not configured', data: null };
  }

  const headers = { Authorization: `Bearer ${token}` };
  const teamQuery = teamId ? `?teamId=${teamId}` : '';

  try {
    const [userRes, projectRes, domainsRes] = await Promise.all([
      fetch('https://api.vercel.com/v2/user', { headers }),
      fetch(`https://api.vercel.com/v9/projects/${projectId}${teamQuery}`, { headers }),
      fetch(`https://api.vercel.com/v9/projects/${projectId}/domains${teamQuery}`, { headers }),
    ]);

    const [userData, projectData, domainsData] = await Promise.all([
      userRes.ok ? userRes.json() : null,
      projectRes.ok ? projectRes.json() : null,
      domainsRes.ok ? domainsRes.json() : null,
    ]);

    return {
      error: null,
      data: {
        user: userData?.user ? {
          name: userData.user.name,
          email: userData.user.email,
          username: userData.user.username,
        } : null,
        project: projectData ? {
          name: projectData.name,
          framework: projectData.framework,
          nodeVersion: projectData.nodeVersion,
          updatedAt: projectData.updatedAt,
          latestDeployments: projectData.latestDeployments?.slice(0, 5).map(d => ({
            id: d.id,
            state: d.state,
            createdAt: d.createdAt,
            url: d.url,
          })) || [],
        } : null,
        domains: domainsData?.domains?.map(d => ({
          name: d.name,
          verified: d.verified,
        })) || [],
      },
    };
  } catch (error) {
    console.error('Vercel API error:', error.message);
    return { error: error.message, data: null };
  }
}

/**
 * Fetch Cloudinary usage statistics
 */
async function fetchCloudinaryData() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return { error: 'Cloudinary credentials not configured', data: null };
  }

  try {
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/usage`,
      {
        headers: { Authorization: `Basic ${auth}` },
      }
    );

    if (!response.ok) {
      throw new Error(`Cloudinary API returned ${response.status}`);
    }

    const data = await response.json();

    return {
      error: null,
      data: {
        plan: data.plan,
        lastUpdated: data.last_updated,
        storage: {
          used: data.storage?.usage || 0,
          limit: data.storage?.limit || 0,
          usedFormatted: formatBytes(data.storage?.usage || 0),
          percentage: data.storage?.limit 
            ? Math.round((data.storage.usage / data.storage.limit) * 100) 
            : 0,
        },
        bandwidth: {
          used: data.bandwidth?.usage || 0,
          limit: data.bandwidth?.limit || 0,
          usedFormatted: formatBytes(data.bandwidth?.usage || 0),
          percentage: data.bandwidth?.limit 
            ? Math.round((data.bandwidth.usage / data.bandwidth.limit) * 100) 
            : 0,
        },
        transformations: {
          used: data.transformations?.usage || 0,
          limit: data.transformations?.limit || 0,
          percentage: data.transformations?.limit 
            ? Math.round((data.transformations.usage / data.transformations.limit) * 100) 
            : 0,
        },
        resources: data.resources || 0,
        derivedResources: data.derived_resources || 0,
      },
    };
  } catch (error) {
    console.error('Cloudinary API error:', error.message);
    return { error: error.message, data: null };
  }
}

/**
 * Fetch Firebase data (Firestore stats, user count)
 */
async function fetchFirebaseData() {
  try {
    const admin = getAdmin();
    const db = getFirestore();

    // Get user count from Firebase Auth
    const listUsersResult = await admin.auth().listUsers(1000);
    const totalUsers = listUsersResult.users.length;
    
    // Get recent users (last 7 days)
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentUsers = listUsersResult.users.filter(
      user => user.metadata.creationTime && 
              new Date(user.metadata.creationTime).getTime() > sevenDaysAgo
    ).length;

    // Get Firestore collection stats
    const [transfersSnap, filesSnap] = await Promise.all([
      db.collection('transfers').count().get(),
      db.collection('files').count().get(),
    ]);

    // Get recent transfers (last 10)
    const recentTransfersSnap = await db.collection('transfers')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    const recentTransfers = recentTransfersSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        fileCount: data.files?.length || 0,
        totalSize: data.totalSize || 0,
        expiresAt: data.expiresAt?.toDate?.()?.toISOString() || data.expiresAt,
      };
    });

    return {
      error: null,
      data: {
        users: {
          total: totalUsers,
          recentSignups: recentUsers,
        },
        firestore: {
          totalTransfers: transfersSnap.data().count,
          totalFiles: filesSnap.data().count,
        },
        recentTransfers,
      },
    };
  } catch (error) {
    console.error('Firebase data error:', error.message);
    return { error: error.message, data: null };
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * GET /api/admin/metrics
 * Fetch aggregated metrics from all services
 */
router.get('/metrics', async (req, res) => {
  // Verify admin access
  const authResult = await verifyAdminAccess(req);
  if (!authResult.authorized) {
    return res.status(401).json({ error: authResult.error });
  }

  // Check cache
  const now = Date.now();
  if (cache.data && (now - cache.timestamp) < CACHE_TTL) {
    return res.status(200).json({
      ...cache.data,
      cached: true,
      cacheAge: Math.round((now - cache.timestamp) / 1000),
    });
  }

  // Fetch all data in parallel
  const [vercelResult, cloudinaryResult, firebaseResult] = await Promise.all([
    fetchVercelData(),
    fetchCloudinaryData(),
    fetchFirebaseData(),
  ]);

  // Build response
  const response = {
    timestamp: new Date().toISOString(),
    cached: false,
    vercel: vercelResult,
    cloudinary: cloudinaryResult,
    firebase: firebaseResult,
    summary: {
      totalUsers: firebaseResult.data?.users?.total || 0,
      recentSignups: firebaseResult.data?.users?.recentSignups || 0,
      totalTransfers: firebaseResult.data?.firestore?.totalTransfers || 0,
      totalFiles: firebaseResult.data?.firestore?.totalFiles || 0,
      storageUsed: cloudinaryResult.data?.storage?.usedFormatted || 'N/A',
      storagePercentage: cloudinaryResult.data?.storage?.percentage || 0,
      bandwidthUsed: cloudinaryResult.data?.bandwidth?.usedFormatted || 'N/A',
      bandwidthPercentage: cloudinaryResult.data?.bandwidth?.percentage || 0,
    },
    errors: {
      vercel: vercelResult.error,
      cloudinary: cloudinaryResult.error,
      firebase: firebaseResult.error,
    },
  };

  // Update cache
  cache = {
    data: response,
    timestamp: now,
  };

  return res.status(200).json(response);
});

export default router;
