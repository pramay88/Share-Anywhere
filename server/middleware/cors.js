/**
 * CORS Middleware Configuration
 * Allows requests from Chrome extension and web app
 */

import cors from 'cors';

const allowedOrigins = [
    'http://localhost:8080',
    'http://localhost:3000',
    'https://share-anywhere.vercel.app',
    // Chrome extension origin pattern
    /^chrome-extension:\/\//,
];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) {
            return callback(null, true);
        }

        // Check if origin is allowed
        const isAllowed = allowedOrigins.some((allowedOrigin) => {
            if (allowedOrigin instanceof RegExp) {
                return allowedOrigin.test(origin);
            }
            return allowedOrigin === origin;
        });

        if (isAllowed) {
            callback(null, true);
        } else {
            console.warn(`⚠️  CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

export default cors(corsOptions);
