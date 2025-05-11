const { validationResult } = require('express-validator');
const { User } = require('../models/user');
const mailSender = require('../helpers/email_sender');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Token } = require('../models/token');

/**
 * User Registration
 * This function handles user registration by validating input,
 * hashing the password, and storing the user in the database.
 */
exports.register = async function (req, res) {
    console.log('Register function called with body:', req.body);
    
    // Check if there are validation errors
    console.log('Running validation...');
    const errors = validationResult(req);
    console.log('Validation result:', errors);
    
    if (!errors.isEmpty()) {
        console.log('Validation errors detected:', errors.array());
        return res.status(400).json({ errors: errors.array().map(error => {
            console.log('Mapping error:', error);
            return {
                field: error.path, // Field where the error occurred
                message: error.msg, // Error message
            };
        })});
    }
    console.log('Validation passed, continuing with registration');

    try {
        console.log('Creating new user with data:', {...req.body, passwordHash: '[HIDDEN]'});
        console.log('Hashing password...');
        const hashedPassword = bcrypt.hashSync(req.body.password, 8);
        console.log('Password hashed successfully');
        
        // Create a new user instance with hashed password
        console.log('Creating user instance...');
        let user = new User({
            ...req.body,
            passwordHash: hashedPassword, // Hash password
        });
        console.log('User instance created:', user);

        // Save the user to the database
        console.log('Attempting to save user to database...');
        user = await user.save();
        console.log('User saved result:', user ? 'Success' : 'Failed');

        if (!user) {
            console.log('Failed to create user - no user returned');
            return res.status(500).json({ type: 'Internal Server Error', message: 'Could not create a new user' });
        }

        console.log('User created successfully:', user._id);
        console.log('Sending response with status 201...');
        return res.status(201).json(user); // Return created user
    } catch (error) {
        console.error('Error during user creation:', error);
        
        // Handle duplicate email error
        if (error.code === 11000) {
            console.log('Duplicate email error detected');
            return res.status(400).json({ type: 'Validation Error', message: 'Email already exists' });
        }
        
        // Check for validation errors from Mongoose
        if (error.name === 'ValidationError') {
            console.log('Mongoose validation error:', error.errors);
            console.log('Extracting validation error fields...');
            const validationErrors = Object.keys(error.errors).map(field => {
                console.log(`Processing field ${field} error: ${error.errors[field].message}`);
                return {
                    field,
                    message: error.errors[field].message
                };
            });
            console.log('Formatted validation errors:', validationErrors);
            return res.status(400).json({ errors: validationErrors });
        }
        
        console.log('Returning generic error response');
        return res.status(500).json({ type: error.name, message: error.message });
    }
};

/**
 * User Login
 * This function verifies user credentials and generates authentication tokens.
 */
/**
 * User login function
 */
// In your auth.js controller
exports.login = async (req, res) => {
    try {
        console.log('login function called with body:', { 
            email: req.body.email, 
            password: req.body.password ? '[HIDDEN]' : undefined 
        });
        
        // Validate input
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }
        
        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        
        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        
        // Generate JWT token - CRITICAL: Include userId in payload
        console.log('Generating tokens for user:', user._id);
        const token = jwt.sign(
            { 
                userId: user._id.toString(), 
                isAdmin: user.isAdmin 
            },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: '7d' }
        );
        
        // Save token to database
        console.log('Saving tokens to the database...');
        const tokenDocument = new Token({
            userId: user._id,
            token: token
        });
        
        await tokenDocument.save();
        console.log('Tokens saved successfully');
        
        // Return success response
        console.log('Login successful for user ID:', user._id);
        return res.status(200).json({
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                isAdmin: user.isAdmin
            },
            token
        });
    } catch (error) {
        console.error('Error in login:', error);
        return res.status(500).json({ message: error.message });
    }
};
/**
 * Refresh Access Token
 * Uses the refresh token stored in a secure cookie to generate a new access token
 */
exports.refreshToken = async function(req, res) {
    console.log('refreshToken function called');
    
    try {
        // Get refresh token from cookie
        console.log('Getting refresh token from cookie...');
        const refreshToken = req.cookies.refreshToken;
        console.log('Refresh token from cookie:', refreshToken ? 'exists' : 'missing');
        
        if (!refreshToken) {
            console.log('No refresh token provided in cookie');
            return res.status(401).json({ message: 'Refresh token required' });
        }
        
        // Find token in database
        console.log('Finding token in database by refresh token...');
        const tokenDoc = await Token.findOne({ refreshToken });
        console.log('Token document found:', tokenDoc ? 'Yes' : 'No');
        
        if (!tokenDoc) {
            console.log('Token not found in database, clearing cookie');
            res.clearCookie('refreshToken', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                path: '/api/v1/refresh-token'
            });
            return res.status(401).json({ message: 'Invalid refresh token' });
        }
        
        // Verify refresh token
        console.log('Verifying refresh token signature...');
        try {
            const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
            console.log('Token verified for user:', decoded.userId);
            
            // Get user
            console.log('Finding user by ID:', decoded.userId);
            const user = await User.findById(decoded.userId);
            console.log('User found:', user ? 'Yes' : 'No');
            
            if (!user) {
                console.log('User not found, clearing cookie and deleting token');
                res.clearCookie('refreshToken', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'strict',
                    path: '/api/v1/refresh-token'
                });
                await Token.findByIdAndDelete(tokenDoc._id);
                return res.status(401).json({ message: 'User not found' });
            }
            
            // Generate new access token
            console.log('Generating new access token...');
            const accessToken = jwt.sign(
                {
                    userId: user._id,
                    isAdmin: user.isAdmin
                },
                process.env.ACCESS_TOKEN_SECRET,
                { expiresIn: '15m' }
            );
            
            // Update token in database
            console.log('Updating access token in database...');
            tokenDoc.accessToken = accessToken;
            await tokenDoc.save();
            console.log('Access token updated in database');
            
            console.log('Refresh successful, returning new access token');
            return res.json({
                message: 'Token refreshed successfully',
                token: accessToken
            });
        } catch (err) {
            console.log('Token verification failed:', err.message);
            console.log('Clearing refresh token cookie...');
            res.clearCookie('refreshToken', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                path: '/api/v1/refresh-token'
            });
            console.log('Deleting token from database...');
            await Token.findByIdAndDelete(tokenDoc._id);
            return res.status(401).json({ message: 'Invalid or expired refresh token' });
        }
    } catch (error) {
        console.error('Error in refreshToken:', error);
        return res.status(500).json({ 
            type: error.name,
            message: error.message
        });
    }
};

/**
 * Logout User
 * Clears the refresh token cookie and removes the token from database
 */
exports.logout = async function(req, res) {
    console.log('logout function called');
    
    try {
        // Get refresh token from cookie
        console.log('Getting refresh token from cookie...');
        const refreshToken = req.cookies.refreshToken;
        console.log('Refresh token from cookie:', refreshToken ? 'exists' : 'missing');
        
        // Clear cookie regardless of token validity
        console.log('Clearing refresh token cookie...');
        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/'
        });
        
        // If we have a token, remove it from database
        if (refreshToken) {
            console.log('Removing token from database...');
            const result = await Token.findOneAndDelete({ refreshToken });
            console.log('Token removed from database:', result ? 'Yes' : 'No');
        }
        
        console.log('Logout completed successfully');
        return res.json({ message: 'Logout successful' });
    } catch (error) {
        console.error('Error in logout:', error);
        return res.status(500).json({ 
            type: error.name,
            message: error.message 
        });
    }
};

/**
 * Check Auth Status
 * Verifies if user is logged in by checking access token
 */
exports.checkAuthStatus = async function(req, res) {
    console.log('checkAuthStatus function called');
    console.log('Headers received:', req.headers);
    
    try {
        // Check for authorization header
        console.log('Getting authorization header...');
        const authHeader = req.headers.authorization;
        console.log('Authorization header:', authHeader ? 'exists' : 'missing');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('Invalid or missing authorization header');
            return res.json({ isLoggedIn: false });
        }
        
        // Extract token
        const accessToken = authHeader.split(' ')[1];
        console.log('Access token extracted:', accessToken ? 'exists' : 'missing');
        
        if (!accessToken) {
            console.log('No token after Bearer prefix');
            return res.json({ isLoggedIn: false });
        }
        
        // Try to verify token
        try {
            console.log('Verifying access token...');
            const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
            console.log('Access token verified for user:', decoded.userId);
            
            // Check if token exists in database for extra security
            console.log('Checking if token exists in database...');
            const tokenExists = await Token.findOne({ accessToken });
            console.log('Token found in database:', tokenExists ? 'Yes' : 'No');
            
            if (!tokenExists) {
                console.log('Token not found in database');
                return res.json({ isLoggedIn: false });
            }
            
            // Token is valid and exists in database
            console.log('User is authenticated');
            return res.json({ 
                isLoggedIn: true,
                userId: decoded.userId,
                isAdmin: decoded.isAdmin 
            });
        } catch (err) {
            console.log('Token verification failed:', err.message);
            
            // If token is expired, check if we have a refresh token cookie
            if (err.name === 'TokenExpiredError' && req.cookies.refreshToken) {
                console.log('Access token expired but refresh token exists');
                return res.json({ 
                    isLoggedIn: false, 
                    tokenExpired: true,
                    hasRefreshToken: true 
                });
            }
            
            return res.json({ isLoggedIn: false });
        }
    } catch (error) {
        console.error('Error in checkAuthStatus:', error);
        return res.status(500).json({ 
            type: error.name,
            message: error.message
        });
    }
};
/**
 * Token Verification
 * This function checks if the provided access token is valid.
 */
exports.verifyToken = async function (req, res) {
    console.log('verifyToken function called');
    console.log('Headers received:', req.headers);
    try {
        console.log('Getting authorization header...');
        const authHeader = req.headers.authorization || '';
        console.log('Authorization header:', authHeader);
        
        console.log('Checking if authorization header is valid...');
        if (!authHeader) {
            console.log('Missing authorization header');
            return res.json(false);
        }
        
        console.log('Checking if header starts with Bearer...');
        if (!authHeader.startsWith('Bearer ')) {
            console.log('Invalid authorization format - must start with Bearer');
            return res.json(false);
        }

        console.log('Extracting token from header...');
        const accessToken = authHeader.split('Bearer ')[1];
        console.log('Extracted token:', accessToken ? '(token present)' : '(empty token)');
        
        console.log('Checking if token exists after extraction...');
        if (!accessToken) {
            console.log('No token after Bearer prefix');
            return res.json(false);
        }
        
        console.log('Looking for token in database...');
        try {
            const token = await Token.findOne({ accessToken });
            console.log('Database query completed');
            console.log('Token found in database:', token ? 'Yes' : 'No');
            
            if (!token) {
                console.log('Token not found in database, returning false');
                return res.json(false);
            }

            console.log('Decoding refresh token...');
            const tokenData = jwt.decode(token.refreshToken);
            console.log('Decoded token data:', tokenData);
            
            console.log('Finding user by ID:', tokenData.id);
            const user = await User.findById(tokenData.id);
            console.log('User find query completed');
            console.log('User found:', user ? 'Yes' : 'No');
            
            if (!user) {
                console.log('User not found, returning false');
                return res.json(false);
            }

            console.log('Verifying refresh token...');
            try {
                const isValid = jwt.verify(token.refreshToken, process.env.REFRESH_TOKEN_SECRET);
                console.log('Token verification completed');
                console.log('Token validation result:', isValid ? 'Valid' : 'Invalid');
                console.log('Sending response: true');
                return res.json(true);
            } catch (verifyError) {
                console.log('Token verification failed:', verifyError.message);
                console.log('Sending response: false');
                return res.json(false);
            }
        } catch (dbError) {
            console.error('Database error during token verification:', dbError);
            return res.status(500).json({ type: 'DatabaseError', message: dbError.message });
        }
    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(500).json({ type: error.name, message: error.message });
    }
};/**
* Forgot Password
* Generates and sends an OTP to the user's email for password reset.
*/
exports.forgotPassword = async function (req, res) {
   console.log('forgotPassword function called with body:', req.body);
   try {
       console.log('Extracting email from request...');
       const { email } = req.body;
       
       if (!email) {
           console.log('No email provided');
           return res.status(400).json({ message: 'Email is required' });
       }
       
       console.log('Finding user with email:', email);
       const user = await User.findOne({ email });
       console.log('User found:', user ? 'Yes' : 'No');
       
       if (!user) {
           console.log('User not found, returning 404');
           return res.status(404).json({ message: 'Incorrect Email' });
       }

       // Generate OTP
       console.log('Generating OTP...');
       const otp = Math.floor(1000 + Math.random() * 9000);
       console.log('Generated OTP:', otp);
       console.log('Setting OTP and expiration on user...');
       
       // Fix: Use correct field name resetPasswordOtp instead of resetPassword
       user.resetPasswordOtp = otp;
       user.resetPasswordOtpExpires = Date.now() + 10 * 60 * 1000; // Expires in 10 minutes
       console.log('OTP expires at:', new Date(user.resetPasswordOtpExpires));
       
       console.log('Saving user with OTP...');
       await user.save();
       console.log('User saved with OTP');

       // Send OTP via email
       console.log('Sending OTP via email...');
       try {
           const response = await mailSender.sendMail(
               email,
               'Password Reset OTP',
               `Your OTP for password reset is: ${otp}\n\nThis code will expire in 10 minutes.`
           );
           console.log('Email sending response:', response);
           
           console.log('Returning success response');
           // Don't return the actual OTP in production
           return res.json({ 
               message: 'Password reset OTP sent to your email',
               // Include this in development only, remove for production
               dev_otp: process.env.NODE_ENV === 'development' ? otp : undefined 
           });
       } catch (emailError) {
           console.error('Error sending email:', emailError);
           // Even if email fails, don't reveal this to potential attackers
           return res.json({ 
               message: 'If your email is registered with us, you will receive a password reset OTP',
               // Include this in development only, remove for production
               dev_otp: process.env.NODE_ENV === 'development' ? otp : undefined,
               dev_error: process.env.NODE_ENV === 'development' ? emailError.message : undefined
           });
       }
   } catch (error) {
       console.error('Error in forgotPassword:', error);
       return res.status(500).json({ type: error.name, message: error.message });
   }
};

/**
* Verify Password Reset OTP
* This function validates the OTP sent to the user's email.
*/
exports.verifyPasswordResetOTP = async function (req, res) {
   console.log('verifyPasswordResetOTP function called with body:', req.body);
   try {
       console.log('Extracting email and OTP from request...');
       const { email, otp } = req.body;
       
       // Validate inputs
       if (!email || !otp) {
           console.log('Missing required fields');
           return res.status(400).json({ message: 'Email and OTP are required' });
       }
       
       console.log('Finding user with email:', email);
       const user = await User.findOne({ email });
       console.log('User found:', user ? 'Yes' : 'No');
       
       if (!user) {
           console.log('User not found, returning 404');
           return res.status(404).json({ message: 'User not found' });
       }

       console.log('User OTP:', user.resetPasswordOtp);
       console.log('Submitted OTP:', +otp);
       console.log('OTP expiration:', user.resetPasswordOtpExpires);
       console.log('Current time:', Date.now());
       console.log('OTP expired:', Date.now() > user.resetPasswordOtpExpires);
       
       // Convert string OTP to number for comparison
       const numericOtp = parseInt(otp);
       
       // Check if OTP is valid and not expired
       if (user.resetPasswordOtp !== numericOtp) {
           console.log('Invalid OTP, returning 401');
           return res.status(401).json({ message: 'Invalid OTP' });
       }
       
       if (!user.resetPasswordOtpExpires || Date.now() > user.resetPasswordOtpExpires) {
           console.log('Expired OTP, returning 401');
           return res.status(401).json({ message: 'OTP has expired' });
       }
       
       console.log('OTP valid, marking as confirmed...');
       user.resetPasswordOtp = 1; // Special flag indicating OTP was verified
       user.resetPasswordOtpExpires = Date.now() + 30 * 60 * 1000; // 30 minutes to reset password
       console.log('Saving user with confirmed OTP...');
       await user.save();
       console.log('User saved with confirmed OTP');
       
       console.log('Returning success response');
       return res.json({ message: 'OTP confirmed successfully. Please reset your password within 30 minutes.' });

   } catch (error) {
       console.error('Error in verifyPasswordResetOTP:', error);
       return res.status(500).json({ type: error.name, message: error.message });
   }
};

/**
* Reset Password
* This function allows users to set a new password after OTP verification.
*/
exports.resetPassword = async function (req, res) {
   console.log('resetPassword function called with body:', {...req.body, newPassword: '[HIDDEN]'});
   
   console.log('Running validation...');
   const errors = validationResult(req);
   console.log('Validation result:', errors.isEmpty() ? 'No errors' : errors.array());
   
   if (!errors.isEmpty()) {
       console.log('Validation errors detected:', errors.array());
       return res.status(400).json({ errors: errors.array().map(error => {
           console.log('Mapping error:', error);
           return {
               field: error.path,
               message: error.msg,
           };
       }) });
   }
   console.log('Validation passed, continuing with password reset');
   
   try {
       console.log('Extracting email and new password...');
       const { email, newPassword } = req.body;
       
       // Validate inputs
       if (!email || !newPassword) {
           console.log('Missing required fields');
           return res.status(400).json({ message: 'Email and new password are required' });
       }
       
       console.log('Finding user with email:', email);
       const user = await User.findOne({ email });
       console.log('User found:', user ? 'Yes' : 'No');
       
       if (!user) {
           console.log('User not found, returning 404');
           return res.status(404).json({ message: 'User not found' });
       }
       
       console.log('Checking if OTP was confirmed (resetPasswordOtp should be 1):', user.resetPasswordOtp);
       
       // Check if OTP was verified and time hasn't expired
       if (user.resetPasswordOtp !== 1) {
           console.log('OTP not confirmed, returning 401');
           return res.status(401).json({ message: 'Please verify your OTP before resetting password' });
       }
       
       if (!user.resetPasswordOtpExpires || Date.now() > user.resetPasswordOtpExpires) {
           console.log('Reset window expired, returning 401');
           return res.status(401).json({ message: 'Password reset time window expired. Please request a new OTP' });
       }
       
       // Check that new password isn't the same as old password
       if (bcrypt.compareSync(newPassword, user.passwordHash)) {
           console.log('New password is same as old password');
           return res.status(400).json({ message: 'New password cannot be the same as your old password' });
       }
       
       console.log('OTP confirmed, hashing new password...');
       user.passwordHash = bcrypt.hashSync(newPassword, 8);
       console.log('Password hashed successfully');
       
       console.log('Clearing reset fields...');
       user.resetPasswordOtp = undefined;
       user.resetPasswordOtpExpires = undefined;
       
       console.log('Saving user with new password...');
       await user.save();
       console.log('User saved with new password');
       
       // Invalidate all tokens for this user for security
       console.log('Invalidating existing tokens...');
       await Token.deleteMany({ userId: user._id });
       console.log('Tokens invalidated');
       
       console.log('Returning success response');
       return res.json({ message: 'Password reset successfully. Please log in with your new password.' });

   } catch (error) {
       console.error('Error in resetPassword:', error);
       return res.status(500).json({ type: error.name, message: error.message });
   }
};

