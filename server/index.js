/**
 * Express Server
 * Backend API for ShareAnywhere
 */

import dotenv from 'dotenv';
import express from 'express';
import { initializeFirebaseAdmin } from './config/firebase.js';
import corsMiddleware from './middleware/cors.js';
import sharesRouter from './routes/shares.js';
import userRouter from './routes/user.js';
import p2pRouter from './routes/p2p.js';

// Load environment variables
dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Firebase Admin
try {
    initializeFirebaseAdmin();
} catch (error) {
    console.error('Failed to initialize Firebase Admin:', error.message);
    console.error('Server will start but API calls will fail until Firebase is configured.');
}

// Middleware
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'ShareAnywhere API is running',
        timestamp: new Date().toISOString(),
    });
});

// Share routes
app.use('/api/shares', sharesRouter);

// User routes (history and stats)
app.use('/api/user', userRouter);

// P2P signaling routes
app.use('/api/p2p', p2pRouter);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error',
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 ShareAnywhere API Server`);
    console.log(`📡 Running on: http://localhost:${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📝 Create share: http://localhost:${PORT}/api/shares/create\n`);
});

export default app;