import { admin } from '../_lib/firebase-admin.js';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { google } from 'googleapis';

// In-memory cache
let cache = {
  data: null,
  timestamp: 0,
};
const CACHE_TTL = 60 * 1000; // 60 seconds

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
 * Initialize Google Auth for GA4 and GSC
 */
function getGoogleAuth() {
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  
  if (!serviceAccountKey) {
    return null;
  }

  try {
    const credentials = JSON.parse(
      Buffer.from(serviceAccountKey, 'base64').toString('utf-8')
    );
    
    return new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/analytics.readonly',
        'https://www.googleapis.com/auth/webmasters.readonly',
      ],
    });
  } catch (error) {
    console.error('Failed to parse Google service account:', error.message);
    return null;
  }
}

/**
 * Fetch GA4 Analytics Data
 */
async function fetchGA4Data(dateRange = '30daysAgo') {
  const propertyId = process.env.GA4_PROPERTY_ID;
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!propertyId || !serviceAccountKey) {
    return { 
      error: 'GA4_PROPERTY_ID or GOOGLE_SERVICE_ACCOUNT_KEY not configured', 
      data: null 
    };
  }

  try {
    const credentials = JSON.parse(
      Buffer.from(serviceAccountKey, 'base64').toString('utf-8')
    );

    const analyticsDataClient = new BetaAnalyticsDataClient({ credentials });

    // Run multiple reports in parallel
    const [
      overviewReport,
      topPagesReport,
      trafficSourcesReport,
      deviceReport,
      geoReport,
      timeSeriesReport,
      realtimeReport,
    ] = await Promise.all([
      // Overview metrics
      analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: dateRange, endDate: 'today' }],
        metrics: [
          { name: 'totalUsers' },
          { name: 'activeUsers' },
          { name: 'newUsers' },
          { name: 'sessions' },
          { name: 'engagedSessions' },
          { name: 'engagementRate' },
          { name: 'averageSessionDuration' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
        ],
      }),
      
      // Top pages
      analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: dateRange, endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'averageSessionDuration' },
          { name: 'bounceRate' },
        ],
        limit: 10,
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      }),

      // Traffic sources
      analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: dateRange, endDate: 'today' }],
        dimensions: [
          { name: 'sessionSource' },
          { name: 'sessionMedium' },
        ],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'engagementRate' },
        ],
        limit: 10,
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      }),

      // Device breakdown
      analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: dateRange, endDate: 'today' }],
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [
          { name: 'totalUsers' },
          { name: 'sessions' },
          { name: 'engagementRate' },
        ],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      }),

      // Geo breakdown (top countries)
      analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: dateRange, endDate: 'today' }],
        dimensions: [{ name: 'country' }],
        metrics: [
          { name: 'totalUsers' },
          { name: 'sessions' },
        ],
        limit: 10,
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      }),

      // Time series (daily)
      analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: dateRange, endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
        ],
        orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
      }),

      // Real-time active users
      analyticsDataClient.runRealtimeReport({
        property: `properties/${propertyId}`,
        metrics: [{ name: 'activeUsers' }],
      }).catch(() => null), // Realtime may not be available for all properties
    ]);

    // Parse overview metrics
    const overviewRow = overviewReport[0]?.rows?.[0]?.metricValues || [];
    const overview = {
      totalUsers: parseInt(overviewRow[0]?.value || '0'),
      activeUsers: parseInt(overviewRow[1]?.value || '0'),
      newUsers: parseInt(overviewRow[2]?.value || '0'),
      sessions: parseInt(overviewRow[3]?.value || '0'),
      engagedSessions: parseInt(overviewRow[4]?.value || '0'),
      engagementRate: parseFloat(overviewRow[5]?.value || '0'),
      avgSessionDuration: parseFloat(overviewRow[6]?.value || '0'),
      pageViews: parseInt(overviewRow[7]?.value || '0'),
      bounceRate: parseFloat(overviewRow[8]?.value || '0'),
    };

    // Parse top pages
    const topPages = (topPagesReport[0]?.rows || []).map(row => ({
      path: row.dimensionValues[0]?.value,
      views: parseInt(row.metricValues[0]?.value || '0'),
      avgDuration: parseFloat(row.metricValues[1]?.value || '0'),
      bounceRate: parseFloat(row.metricValues[2]?.value || '0'),
    }));

    // Parse traffic sources
    const trafficSources = (trafficSourcesReport[0]?.rows || []).map(row => ({
      source: row.dimensionValues[0]?.value,
      medium: row.dimensionValues[1]?.value,
      sessions: parseInt(row.metricValues[0]?.value || '0'),
      users: parseInt(row.metricValues[1]?.value || '0'),
      engagementRate: parseFloat(row.metricValues[2]?.value || '0'),
    }));

    // Parse device breakdown
    const devices = (deviceReport[0]?.rows || []).map(row => ({
      device: row.dimensionValues[0]?.value,
      users: parseInt(row.metricValues[0]?.value || '0'),
      sessions: parseInt(row.metricValues[1]?.value || '0'),
      engagementRate: parseFloat(row.metricValues[2]?.value || '0'),
    }));

    // Parse geo breakdown
    const countries = (geoReport[0]?.rows || []).map(row => ({
      country: row.dimensionValues[0]?.value,
      users: parseInt(row.metricValues[0]?.value || '0'),
      sessions: parseInt(row.metricValues[1]?.value || '0'),
    }));

    // Parse time series
    const timeSeries = (timeSeriesReport[0]?.rows || []).map(row => ({
      date: row.dimensionValues[0]?.value,
      activeUsers: parseInt(row.metricValues[0]?.value || '0'),
      sessions: parseInt(row.metricValues[1]?.value || '0'),
      pageViews: parseInt(row.metricValues[2]?.value || '0'),
    }));

    // Parse realtime
    const realtimeUsers = realtimeReport?.[0]?.rows?.[0]?.metricValues?.[0]?.value 
      ? parseInt(realtimeReport[0].rows[0].metricValues[0].value) 
      : 0;

    return {
      error: null,
      data: {
        overview,
        topPages,
        trafficSources,
        devices,
        countries,
        timeSeries,
        realtimeUsers,
      },
    };
  } catch (error) {
    console.error('GA4 API error:', error.message);
    return { error: error.message, data: null };
  }
}

/**
 * Fetch Google Search Console Data
 */
async function fetchGSCData(dateRange = '30daysAgo') {
  const siteUrl = process.env.GSC_SITE_URL;
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!siteUrl || !serviceAccountKey) {
    return { 
      error: 'GSC_SITE_URL or GOOGLE_SERVICE_ACCOUNT_KEY not configured', 
      data: null 
    };
  }

  try {
    const auth = getGoogleAuth();
    if (!auth) {
      return { error: 'Failed to initialize Google Auth', data: null };
    }

    const searchConsole = google.searchconsole({ version: 'v1', auth });

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    const days = dateRange === '7daysAgo' ? 7 : dateRange === '90daysAgo' ? 90 : 30;
    startDate.setDate(endDate.getDate() - days);

    const formatDate = (d) => d.toISOString().split('T')[0];

    // Run multiple queries in parallel
    const [
      overviewData,
      queryData,
      pageData,
      countryData,
      deviceData,
      timeSeriesData,
    ] = await Promise.all([
      // Overview metrics
      searchConsole.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: [],
        },
      }),

      // Top queries
      searchConsole.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ['query'],
          rowLimit: 10,
        },
      }),

      // Top pages
      searchConsole.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ['page'],
          rowLimit: 10,
        },
      }),

      // Country performance
      searchConsole.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ['country'],
          rowLimit: 10,
        },
      }),

      // Device performance
      searchConsole.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ['device'],
        },
      }),

      // Time series (daily)
      searchConsole.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ['date'],
        },
      }),
    ]);

    // Parse overview
    const overview = overviewData.data.rows?.[0] || {};
    const overviewMetrics = {
      clicks: overview.clicks || 0,
      impressions: overview.impressions || 0,
      ctr: (overview.ctr || 0) * 100, // Convert to percentage
      position: overview.position || 0,
    };

    // Parse top queries
    const topQueries = (queryData.data.rows || []).map(row => ({
      query: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: (row.ctr || 0) * 100,
      position: row.position,
    }));

    // Parse top pages
    const topPages = (pageData.data.rows || []).map(row => ({
      page: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: (row.ctr || 0) * 100,
      position: row.position,
    }));

    // Parse country data
    const countries = (countryData.data.rows || []).map(row => ({
      country: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: (row.ctr || 0) * 100,
      position: row.position,
    }));

    // Parse device data
    const devices = (deviceData.data.rows || []).map(row => ({
      device: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: (row.ctr || 0) * 100,
      position: row.position,
    }));

    // Parse time series
    const timeSeries = (timeSeriesData.data.rows || []).map(row => ({
      date: row.keys[0],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: (row.ctr || 0) * 100,
      position: row.position,
    }));

    // Try to get index coverage (may require different permissions)
    let indexCoverage = null;
    try {
      const sitemaps = await searchConsole.sitemaps.list({ siteUrl });
      indexCoverage = {
        sitemapsCount: sitemaps.data.sitemap?.length || 0,
        sitemaps: (sitemaps.data.sitemap || []).map(s => ({
          path: s.path,
          lastSubmitted: s.lastSubmitted,
          isPending: s.isPending,
          warnings: s.warnings,
          errors: s.errors,
        })),
      };
    } catch (e) {
      // Index coverage data not available
    }

    return {
      error: null,
      data: {
        overview: overviewMetrics,
        topQueries,
        topPages,
        countries,
        devices,
        timeSeries,
        indexCoverage,
      },
    };
  } catch (error) {
    console.error('GSC API error:', error.message);
    return { error: error.message, data: null };
  }
}

/**
 * Main handler for /api/admin/analytics
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

  // Get date range from query params
  const { range = '30daysAgo' } = req.query;
  const validRanges = ['7daysAgo', '30daysAgo', '90daysAgo'];
  const dateRange = validRanges.includes(range) ? range : '30daysAgo';

  // Check cache (include date range in cache key check)
  const cacheKey = `analytics_${dateRange}`;
  const now = Date.now();
  if (cache.data && cache.key === cacheKey && (now - cache.timestamp) < CACHE_TTL) {
    return res.status(200).json({
      ...cache.data,
      cached: true,
      cacheAge: Math.round((now - cache.timestamp) / 1000),
    });
  }

  // Fetch all data in parallel
  const [ga4Result, gscResult] = await Promise.all([
    fetchGA4Data(dateRange),
    fetchGSCData(dateRange),
  ]);

  // Build response
  const response = {
    timestamp: new Date().toISOString(),
    dateRange,
    cached: false,
    ga4: ga4Result,
    gsc: gscResult,
    errors: {
      ga4: ga4Result.error,
      gsc: gscResult.error,
    },
  };

  // Update cache
  cache = {
    data: response,
    key: cacheKey,
    timestamp: now,
  };

  return res.status(200).json(response);
}
