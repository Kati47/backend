// Importing the Express framework
const express = require('express');

// Creating a router instance to define routes
const router = express.Router();

// Importing the authentication controller which contains the logic for handling authentication
const authController = require('../controllers/auth');

// Importing the 'body' function from 'express-validator' to validate user input
const { body } = require('express-validator');

// Defining validation rules for user registration
const validateUser = [
    body('name').not().isEmpty().withMessage('Name is required'),
    body('email').not().isEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email format'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .isStrongPassword().withMessage('Password must contain at least one uppercase, one lowercase, and one symbol'),
    body('phone').isMobilePhone().withMessage('Please enter a valid phone number')
];

const validatePassword=[
     
     // Ensures the 'password' has a minimum length of 8 characters and includes specific requirements (Error in message: it doesn't validate uppercase/lowercase/symbols)
     body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters').
     isStrongPassword().withMessage('Password must contain at least one uppercase, one lowercase, and one symbol'),
 

];

// Route for user login - Calls the 'login' method from the authentication controller
router.post('/login', authController.login);

// Route for user registration - Uses 'validateUser' middleware for input validation, then calls 'register' method
router.post('/register', authController.register);

router.post('/verify-token', authController.verifyToken);

// Route for handling forgotten passwords - Calls 'forgotPassword' method from the authentication controller
router.post('/forgot-password', authController.forgotPassword);

// Route for verifying OTP during password reset - Calls 'verifyPasswordResetOTP' method
router.post('/verify-otp', authController.verifyPasswordResetOTP);

// Refresh token route (no JWT auth required)
router.post('/refresh-token', authController.refreshToken);

router.get('/refresh-auth-status', authController.checkAuthStatus);

// Logout route
router.post('/logout', authController.logout);
// Route for resetting the password - Calls 'resetPassword' method
router.post('/reset-password', validatePassword,authController.resetPassword);

// Exporting the router to be used in the main application
module.exports = router;
