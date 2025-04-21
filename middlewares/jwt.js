const { expressjwt: expjwt } = require('express-jwt');
const { Token } = require('../models/token');
const { User } = require('../models/user');
const jwt = require('jsonwebtoken'); // Make sure this is imported

/**
 * Authentication middleware function
 * Returns express-jwt middleware configured with our settings
 */
exports.authJwt = function() {
    // Get API URL prefix and secret from environment variables
    const secret = process.env.ACCESS_TOKEN_SECRET;
    
    console.log('Setting up JWT middleware with secret:', secret ? 'Secret exists' : 'NO SECRET FOUND');
    
    return expjwt({
        secret,
        algorithms: ['HS256'],
        isRevoked: isRevoked
    }).unless({
        // List of paths that don't require authentication
        path: [
            // Public API endpoints
            { url: /\/api\/v1\/login(.*)/, methods: ['POST', 'GET'] },
            { url: /\/api\/v1\/register(.*)/, methods: ['POST'] },
            { url: /\/api\/v1\/forgot-password(.*)/, methods: ['POST'] },
            { url: /\/api\/v1\/verify-otp(.*)/, methods: ['POST'] },
            { url: /\/api\/v1\/reset-password(.*)/, methods: ['POST'] },
            { url: /\/api\/v1\/verify-token(.*)/, methods: ['GET', 'POST'] },
            
            // Public product endpoints - allow GET only
            { url: /\/api\/v1\/products(.*)/, methods: ['GET'] },
            { url: /\/api\/v1\/categories(.*)/, methods: ['GET'] },
            { url: /\/api\/v1\/products\/recommendations(.*)/, methods: ['GET', 'POST'] }, // Allow both GET and POST for recommendations

            // Public cart endpoints
            { url: /\/api\/v1\/cart\/find\/(.*)/, methods: ['GET'] },
            
            // Public static files
            { url: /\/uploads\/(.*)/, methods: ['GET'] },
            
            // Debug endpoint
            { url: /\/api\/v1\/debug-auth(.*)/, methods: ['GET'] },
        ],
    });
};

/**
 * Determines if a token should be considered revoked
 * Also handles admin authorization checks
 */
// In your middlewares/jwt.js file
/**
 * Determines if a token should be considered revoked
 * Also handles admin authorization checks
 */
async function isRevoked(req, payload) {
    try {
        // Get authorization header
        const authHeader = req.headers?.authorization;
        
        console.log('🔍 JWT check - URL:', req.originalUrl);
        console.log('🔑 JWT check - Header present:', !!authHeader);
        
        // Log payload for debugging
        console.log('🔍 JWT payload received by middleware:', payload);
        
        // If header is missing, deny access
        if (!authHeader) {
            console.log('❌ No authorization header found');
            return true;
        }
        
        // Check header format
        if (!authHeader.startsWith('Bearer ')) {
            console.log('❌ Authorization header does not start with Bearer');
            return true;
        }
        
        // Extract token
        const token = authHeader.replace('Bearer ', '').trim();
        const tokenShort = token.substring(0, 10) + '...';
        console.log('🔒 JWT check - Token extracted:', tokenShort);
        
        // Get user ID directly from the payload
        // The payload structure varies based on the express-jwt version
        const userId = typeof payload === 'object' && payload !== null 
            ? (payload.userId || (payload.payload && payload.payload.userId))
            : null;
        
        if (!userId) {
            console.log('❌ JWT check - No userId found in payload');
            // Try to decode token manually for debugging
            try {
                const decodedManually = jwt.decode(token);
                console.log('🔍 Manual decode result:', decodedManually);
            } catch (err) {
                console.log('🔍 Manual decode failed:', err.message);
            }
            return true;
        }
        
        console.log('👤 JWT check - User ID from payload:', userId);
        
        // Find token in database
        const tokenDoc = await Token.findOne({ token });
        console.log('🔎 JWT check - Token found in database:', tokenDoc ? '✅ Yes' : '❌ No');
        
        if (!tokenDoc) {
            // If exact token not found, try finding by userId
            const userTokens = await Token.find({ 
                userId: userId,
                revoked: { $ne: true }
            });
            console.log(`🔎 JWT check - Found ${userTokens.length} active tokens for user`);
            
            if (userTokens.length === 0) {
                console.log('❌ JWT check - No active tokens found for user');
                return true;
            }
            
            // Continue with first active token
            console.log('✅ JWT check - Using first active token for user');
        }
        
        // Find the user associated with this token
        const user = await User.findById(userId);
        
        if (!user) {
            console.log('❌ JWT check - User not found for token');
            return true;
        }
        
        // Add user info to request
        req.user = user;
        req.userId = user._id;
        
        console.log('👤 JWT check - User:', user.email, 'Admin:', user.isAdmin ? '✅ Yes' : '❌ No');
        
        // Admin route check (if needed)
        const adminRouteRegex = /^\/api\/v1\/admin\//i;
        const isAdminRoute = adminRouteRegex.test(req.originalUrl);
        
        if (isAdminRoute && !user.isAdmin) {
            console.log('👮 JWT check - Admin route access: ❌ Denied');
            return true;
        }
        
        // Check if /users/ routes need admin access
        const usersRouteRegex = /^\/api\/v1\/users\//i;
        const isUsersRoute = usersRouteRegex.test(req.originalUrl);
        
        if (isUsersRoute && !user.isAdmin && !req.originalUrl.includes('/profile')) {
            console.log('👮 JWT check - Users route access: ❌ Denied (admin only)');
            return true;
        }
        
        console.log('🔐 JWT check - Access decision: ✅ Allowed');
        return false; // Allow access
    } catch (error) {
        console.error('❌ Error in isRevoked function:', error);
        return true;
    }
}

/**
 * Helper middleware to restrict access to admin users only
 */
exports.adminOnly = function() {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        
        if (!req.user.isAdmin) {
            return res.status(403).json({ message: 'Admin access required' });
        }
        
        next();
    };
};