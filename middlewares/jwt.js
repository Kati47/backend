// Middleware for JWT authentication
// This file handles JSON Web Token validation and permission checking
const { expressjwt: expjwt } = require('express-jwt');

// Import Token model to verify token exists in database
const { Token } = require('../models/token');

/**
 * Authentication middleware function
 * Returns express-jwt middleware configured with our settings
 */
exports.authJwt = function() {
    // Get API URL prefix from environment variables
    const API = process.env.API_URL;
    
    // Return configured express-jwt middleware
    return expjwt({
        // Secret key for verifying token signatures
        secret: process.env.ACCESS_TOKEN_SECRET,
        // Specify the algorithm(s) used for token signing
        algorithms: ['HS256'],
        // Custom function to check if token is revoked or user lacks permission
        isRevoked: isRevoked
    }).unless({
        // List of paths that don't require authentication
        path: [
            // Login endpoints
            `${API}/login`,
            `${API}/login/`,
            
            // Registration endpoints
            `${API}/register`,
            `${API}/register/`,
            
            // Password reset flow endpoints
            `${API}/forgot-password`, // Fixed typo in 'password'
            `${API}/forgot-password/`,
            
            `${API}/verify-otp`,
            `${API}/verify-otp/`,
            
            `${API}/reset-password`, // Fixed typo in 'password'
            `${API}/reset-password/`,
            
            // Add verify-token endpoint to public paths
            `${API}/verify-token`,
            `${API}/verify-token/`,
        ],
    });
};

/**
 * Determines if a token should be considered revoked
 * Also handles admin authorization checks
 * 
 * @param {Object} req - Express request object
 * @param {Object} jwt - Decoded JWT payload
 * @returns {boolean} - True if access should be denied, false to allow
 */
async function isRevoked(req, jwt) {
    try {
        // Get authorization header, handling undefined case
        const authHeader = req.headers?.authorization;
        
        // If header is missing, deny access
        if (!authHeader) {
            console.log('No authorization header found');
            return true;
        }
        
        // Check if header has correct format
        if (!authHeader.startsWith('Bearer ')) {
            console.log('Authorization header does not start with Bearer');
            return true;
        }
        
        // Extract token from header (fixed: added space after Bearer)
        const accessToken = authHeader.replace('Bearer ', '').trim();
        
        // Verify token exists in database
        const token = await Token.findOne({ accessToken });
        console.log('Token found in database:', token ? 'Yes' : 'No');
        
        // Check if route is admin-only
        const adminRouteRegex = /^\/api\/v1\/admin\//i;
        
        // Deny access if user is not admin but route requires admin
        const adminFault = !jwt.payload.isAdmin && adminRouteRegex.test(req.originalUrl);
        
        if (adminFault) {
            console.log('Non-admin user attempting to access admin route');
        }
        
        if (!token) {
            console.log('Token not found in database');
        }
        
        // Return true to revoke access if admin check fails or token isn't in database
        return adminFault || !token;
    } catch (error) {
        // If any error occurs during verification, deny access for safety
        console.error('Error in isRevoked function:', error);
        return true;
    }
}