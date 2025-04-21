const express = require('express');
const router = express.Router();

// Add this test route for cookie debugging
router.get('/cookie-test', (req, res) => {
    console.log('Cookie test route called');
    console.log('Cookies received:', req.cookies);
    
    // Set a test cookie
    res.cookie('testCookie', 'hello-world', {
        httpOnly: true,
        secure: false, // Set to false for testing on localhost
        sameSite: 'lax', // More permissive for testing
        maxAge: 1000 * 60 * 5, // 5 minutes
        path: '/'
    });
    
    res.json({
        message: 'Test cookie set',
        cookiesReceived: req.cookies
    });
});

// Fix the cookie-clear route (remove the duplicate)
router.get('/cookie-clear', (req, res) => {
    console.log('Cookie clear route called');
    console.log('Cookies received:', req.cookies);
    
    // Clear test cookie
    res.clearCookie('testCookie', {
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'lax'
    });
    
    // Also clear refresh token cookie to test that
    res.clearCookie('refreshToken', {
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'lax'
    });
    
    // Log after clearing
    console.log('Cookies after clearing (should still show in req.cookies):', req.cookies);
    
    res.json({
        message: 'Cookies cleared',
        note: "The cookies still appear in req.cookies because clearing takes effect after the response is sent",
        cookiesBefore: req.cookies
    });
});

// Add this route to check cookies after clearing
router.get('/cookie-check', (req, res) => {
    console.log('Cookie check route called');
    console.log('Cookies received:', req.cookies);
    
    res.json({
        message: 'Current cookies',
        cookies: req.cookies
    });
});

// Make sure to export the router (this is often missed)
module.exports = router;