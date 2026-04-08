import { admin, db } from '../_lib/firebase-admin.js';

// In-memory cache
let cache = {
  data: null,
  timestamp: 0,
};
const CACHE_TTL = 45 * 1000; // 45 seconds

// Admin email allowlist (fallback if env var not set)
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

  if (!token) {
    return { error: 'VERCEL_API_TOKEN not configured', data: null };
  }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    const [userRes, projectRes, domainsRes, deploymentsRes] = await Promise.all([
      fetch('https://api.vercel.com/v2/user', { headers }),
      fetch(`https://api.vercel.com/v9/projects/${projectId}`, { headers }),
      fetch(`https://api.vercel.com/v9/projects/${projectId}/domains`, { headers }),
      fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=10`, { headers }),
    ]);

    const [userData, projectData, domainsData, deploymentsData] = await Promise.all([
      userRes.ok ? userRes.json() : null,
      projectRes.ok ? projectRes.json() : null,
      domainsRes.ok ? domainsRes.json() : null,
      deploymentsRes.ok ? deploymentsRes.json() : null,
    ]);

    // Process deployments
    const deployments = deploymentsData?.deployments || [];
    const buildTimes = deployments
      .filter(d => d.ready && d.buildingAt)
      .map(d => Math.round((d.ready - d.buildingAt) / 1000));
    const avgBuildTime = buildTimes.length > 0 
      ? Math.round(buildTimes.reduce((a, b) => a + b, 0) / buildTimes.length)
      : 0;

    // Build recent activity from deployments
    const recentActivity = deployments.slice(0, 5).map(d => {
      const isProduction = d.target === 'production';
      const action = isProduction ? 'Deployed' : 'Preview deployed';
      return {
        id: d.uid,
        type: 'deployment',
        text: `${action} ${d.name} (${d.meta?.githubCommitSha?.slice(0, 7) || '—'} → ${d.meta?.githubCommitRef || 'main'}) to ${isProduction ? 'production' : 'preview'}`,
        createdAt: d.createdAt,
      };
    });

    // Sort by createdAt
    recentActivity.sort((a, b) => b.createdAt - a.createdAt);

    return {
      error: null,
      data: {
        user: userData?.user ? {
          name: userData.user.name,
          email: userData.user.email,
          username: userData.user.username,
        } : null,
        project: {
          id: projectData?.id || projectId,
          name: projectData?.name || 'share-anywhere',
          framework: projectData?.framework || 'vite',
          nodeVersion: projectData?.nodeVersion || '20.x',
          plan: projectData?.targets?.production?.plan || 'hobby',
          region: projectData?.targets?.production?.createdIn || 'sfo1',
          analytics: !!projectData?.analytics?.id,
          speedInsights: !!projectData?.speedInsights?.id,
          gitRepository: projectData?.link ? {
            repo: projectData.link.repo,
            org: projectData.link.org,
            type: projectData.link.type,
            productionBranch: projectData.link.productionBranch || 'main',
          } : null,
        },
        deployments: deployments.slice(0, 5).map(d => ({
          id: d.uid,
          name: d.name,
          url: d.url,
          state: d.state,
          target: d.target || 'preview',
          createdAt: d.createdAt,
          buildTime: d.ready && d.buildingAt ? Math.round((d.ready - d.buildingAt) / 1000) : null,
          meta: {
            branch: d.meta?.githubCommitRef || 'main',
            sha: d.meta?.githubCommitSha?.slice(0, 7),
            message: d.meta?.githubCommitMessage?.split('\n')[0] || '',
          },
        })),
        recentActivity: recentActivity.slice(0, 5),
        totalDeployments: deploymentsData?.pagination?.count || deployments.length,
        avgBuildTime,
        domains: domainsData?.domains?.map(d => ({
          name: d.name,
          verified: d.verified,
        })) || [],
        domainsCount: domainsData?.pagination?.count || domainsData?.domains?.length || 0,
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
      { headers: { Authorization: `Basic ${auth}` } }
    );

    if (!response.ok) {
      throw new Error(`Cloudinary API returned ${response.status}`);
    }

    const data = await response.json();

    return {
      error: null,
      data: {
        plan: data.plan || 'Free',
        lastUpdated: data.last_updated,
        credits: {
          used: data.credits?.usage || 0,
          limit: data.credits?.limit || 25,
          percentage: data.credits?.used_percent || 0,
        },
        storage: {
          used: data.storage?.usage || 0,
          credits: data.storage?.credits_usage || 0,
        },
        bandwidth: {
          used: data.bandwidth?.usage || 0,
          credits: data.bandwidth?.credits_usage || 0,
        },
        transformations: {
          used: data.transformations?.usage || 0,
          credits: data.transformations?.credits_usage || 0,
        },
        requests: data.requests || 0,
        resources: data.resources || 0,
        derivedResources: data.derived_resources || 0,
        objects: data.objects?.usage || 0,
        mediaLimits: {
          imageMaxSizeBytes: data.media_limits?.image_max_size_bytes || 10485760,
          videoMaxSizeBytes: data.media_limits?.video_max_size_bytes || 104857600,
          imageMaxPixels: data.media_limits?.image_max_px || 25000000,
        },
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
    let totalTransfers = 0;
    let totalFiles = 0;
    let recentTransfers = [];

    try {
      const transfersSnap = await db.collection('transfers').count().get();
      totalTransfers = transfersSnap.data().count || 0;
    } catch (e) {
      console.log('Transfers collection not found or empty');
    }

    try {
      const filesSnap = await db.collection('files').count().get();
      totalFiles = filesSnap.data().count || 0;
    } catch (e) {
      console.log('Files collection not found or empty');
    }

    try {
      const recentTransfersSnap = await db.collection('transfers')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      recentTransfers = recentTransfersSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          fileCount: data.files?.length || data.fileCount || 0,
          totalSize: data.totalSize || 0,
        };
      });
    } catch (e) {
      console.log('Could not fetch recent transfers');
    }

    return {
      error: null,
      data: {
        users: {
          total: totalUsers,
          recentSignups: recentUsers,
        },
        firestore: {
          totalTransfers,
          totalFiles,
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
 * Main handler for /api/admin/metrics
 */
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
}
