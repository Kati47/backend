const jwt = require('jsonwebtoken');
const { Token } = require('../models/token');
const { User } = require('../models/user');

/**
 * Global error handling middleware
 * Handles authentication errors and other API exceptions
 */
async function errorHandler(error, req, res, next) {
    // Enhanced logging with request details for better debugging
    console.log('🚫 Error handler triggered:', error.name, error.message);
    console.log('📍 Route:', req.method, req.originalUrl);
    
    // Handle authentication errors
    if (error.name === 'UnauthorizedError') {
        // Case 1: JWT has expired - attempt to refresh
        if (error.message.includes('jwt expired')) {
            console.log('⏰ JWT expired, attempting to refresh token');
            return await handleTokenRefresh(req, res, next);
        } 
        // Case 2: No token provided
        else if (error.message.includes('No authorization token was found')) {
            console.log('🔒 No authorization token provided in request');
            return res.status(401).json({ 
                type: 'Unauthorized', 
                message: 'Authentication required. Please log in.',
                details: 'Missing Authorization header with Bearer token'
            });
        }
        // Case 3: Invalid token format or signature
        else if (error.message.includes('invalid signature') || 
                 error.message.includes('invalid token')) {
            console.log('⚠️ Invalid token provided');
            return res.status(401).json({
                type: 'Unauthorized',
                message: 'Invalid authentication token',
                details: 'The token provided is malformed or has an invalid signature'
            });
        }
        // Case 4: Other authentication errors
        else {
            console.log('🚫 Other authentication error:', error.message);
            return res.status(401).json({ 
                type: 'Unauthorized', 
                message: error.message 
            });
        }
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
        console.log('📝 Validation error:', error.message);
        return res.status(400).json({ 
            type: 'ValidationError', 
            message: error.message,
            details: error.errors
        });
    }
    
    // Handle not found errors
    if (error.name === 'NotFoundError') {
        return res.status(404).json({ 
            type: 'NotFoundError', 
            message: error.message 
        });
    }
    
    // Handle database errors
    if (error.name === 'MongoError' || error.name === 'MongoServerError') {
        // Check for duplicate key error
        if (error.code === 11000) {
            return res.status(409).json({
                type: 'DuplicateError',
                message: 'A resource with this identifier already exists',
                details: error.keyValue
            });
        }
        
        return res.status(500).json({ 
            type: 'DatabaseError', 
            message: 'A database error occurred',
            details: error.message
        });
    }
    
    // Handle all other errors
    console.log('💥 Unhandled error type:', error.name);
    return res.status(500).json({ 
        type: error.name || 'InternalServerError', 
        message: error.message || 'An unexpected error occurred' 
    });
}

/**
 * Helper function to handle token refresh
 */
async function handleTokenRefresh(req, res, next) {
    try {
        // Check if authorization header exists
        const tokenHeader = req.headers.authorization;
        if (!tokenHeader) {
            console.log('❌ No authorization header present');
            return res.status(401).json({ 
                type: 'Unauthorized', 
                message: 'No token provided' 
            });
        }

        // Extract the expired access token
        const accessToken = tokenHeader.split(' ')[1];
        console.log('🔑 Expired token extracted:', accessToken ? 
                   `${accessToken.substring(0, 10)}...` : '(empty token)');

        // Find the token in database to get refresh token
        const token = await Token.findOne({
            accessToken,
            refreshToken: { $exists: true }
        });
        
        if (!token) {
            console.log('❌ Token not found in database');
            return res.status(401).json({ 
                type: 'Unauthorized', 
                message: 'Token does not exist or has been revoked' 
            });
        }
        console.log('✅ Token found in database');

        // Verify the refresh token
        const userData = jwt.verify(token.refreshToken, process.env.REFRESH_TOKEN_SECRET);
        console.log('✅ Refresh token verified for user:', userData.id);

        // Find the user associated with the token
        const user = await User.findById(userData.id);
        if (!user) {
            console.log('❌ User not found:', userData.id);
            return res.status(404).json({ message: 'User not found' });
        }
        console.log('👤 User found:', user.id);

        // Generate new access token
        const newAccessToken = jwt.sign(
            { 
                id: user.id, 
                isAdmin: user.isAdmin 
            },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: '24h' }
        );
        console.log('🔄 New access token generated');

        // Update request headers for downstream middleware
        req.headers.authorization = `Bearer ${newAccessToken}`;
        
        // Update token in database
        await Token.updateOne(
            { _id: token._id },
            { accessToken: newAccessToken }
        );
        console.log('💾 Token updated in database');
        
        // Set new token in response headers
        res.set('Authorization', `Bearer ${newAccessToken}`);
        
        // Continue processing the request with refreshed token
        console.log('✅ Continuing with refreshed token');
        return next();
    } catch (refreshError) {
        console.error('❌ Error refreshing token:', refreshError);
        
        // Handle different refresh error scenarios
        if (refreshError.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                type: 'Unauthorized', 
                message: 'Refresh token has expired. Please log in again.' 
            });
        }
        
        if (refreshError.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                type: 'Unauthorized', 
                message: 'Invalid refresh token. Please log in again.' 
            });
        }
        
        return res.status(401).json({ 
            type: 'Unauthorized', 
            message: 'Authentication failed during token refresh.' 
        });
    }
}

module.exports = errorHandler;