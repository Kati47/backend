const jwt = require('jsonwebtoken');
const { Token } = require('../models/token');
const { User } = require('../models/user'); // Missing import

async function errorHandler(error, req, res, next) {
    // Log the error for debugging
    console.log('Error handler triggered:', error.name, error.message);

    if (error.name === 'UnauthorizedError') {
        if (error.message.includes('jwt expired')) {
            console.log('JWT expired, attempting to refresh token');
            
            try {
                const tokenHeader = req.headers.authorization;
                if (!tokenHeader) {
                    console.log('No authorization header present');
                    return res.status(401).json({ type: 'Unauthorized', message: 'No token provided' });
                }

                const accessToken = tokenHeader.split(' ')[1];
                console.log('Access token extracted:', accessToken ? '(token present)' : '(empty token)');

                const token = await Token.findOne({
                    accessToken,
                    refreshToken: { $exists: true }
                });
                
                if (!token) {
                    console.log('Token not found in database');
                    return res.status(401).json({ type: 'Unauthorized', message: 'Token does not exist' });
                }
                console.log('Token found in database');

                const userData = jwt.verify(token.refreshToken, process.env.REFRESH_TOKEN);
                console.log('Refresh token verified for user:', userData.id);

                const user = await User.findById(userData.id);
                if (!user) {
                    console.log('User not found:', userData.id);
                    return res.status(404).json({ message: 'Invalid User!' });
                }
                console.log('User found:', user.id);

                const newAccessToken = jwt.sign(
                    { id: user.id, isAdmin: user.isAdmin },
                    process.env.ACCESS_TOKEN_SECRET,
                    { expiresIn: '24h' }
                );
                console.log('New access token generated');

                // Update request headers for downstream middleware
                req.headers['authorization'] = `Bearer ${newAccessToken}`;
                
                // Fix: Corrected field name from "acessToken" to "accessToken"
                await Token.updateOne(
                    { _id: token.id },
                    { accessToken: newAccessToken }
                ).exec();
                console.log('Token updated in database');
                
                // Set new token in response header
                res.set('Authorization', `Bearer ${newAccessToken}`);
                
                // Important: Continue processing the request with next()
                console.log('Continuing with refreshed token');
                return next();
            } catch (refreshError) {
                console.error('Error refreshing token:', refreshError);
                return res.status(401).json({ type: 'Unauthorized', message: refreshError.message });
            }
        } else {
            // Other unauthorized errors
            return res.status(401).json({ type: error.name, message: error.message });
        }
    }
    
    // Handle other types of errors
    console.log('Unhandled error type:', error.name);
    return res.status(500).json({ type: error.name, message: error.message });
}

module.exports = errorHandler;