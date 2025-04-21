/**
 * PayPal Helper Services
 * This file exports PayPal configuration helpers only, not routes.
 * All routes are now consolidated in order.js
 */
const express = require('express');
const router = express.Router();
const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');

/**
 * PayPal utility functions
 */
// Configure PayPal environment
function environment() {
    console.log('📡 Creating PayPal environment...');
    
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    
    console.log(`- Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`- Client ID exists: ${!!clientId}`);
    console.log(`- Client Secret exists: ${!!clientSecret}`);
    
    if (!clientId || !clientSecret) {
        console.error('❌ ERROR: Missing PayPal credentials!');
        throw new Error('PayPal credentials missing');
    }
    
    if (process.env.NODE_ENV === 'production') {
        console.log('🚀 Using PayPal LIVE environment');
        return new checkoutNodeJssdk.core.LiveEnvironment(clientId, clientSecret);
    }
    
    console.log('🧪 Using PayPal SANDBOX environment');
    return new checkoutNodeJssdk.core.SandboxEnvironment(clientId, clientSecret);
}

// Create PayPal client
function paypalClient() {
    console.log('📡 Creating PayPal HTTP client...');
    try {
        return new checkoutNodeJssdk.core.PayPalHttpClient(environment());
    } catch (error) {
        console.error('❌ Failed to create PayPal client:', error);
        throw error;
    }
}

// Convert country name to ISO country code
function getCountryCode(country) {
    console.log(`🔍 Converting country: "${country}"`);
    
    if (!country) {
        console.log('⚠️ No country provided, using default: US');
        return 'US';
    }
    
    // If already a 2-letter code, return uppercase
    if (country.length === 2) {
        const upperCode = country.toUpperCase();
        console.log(`✅ Country code already in ISO format: ${upperCode}`);
        return upperCode;
    }
    
    const countryMap = {
        'usa': 'US',
        'united states': 'US',
        'canada': 'CA',
        'uk': 'GB',
        'united kingdom': 'GB',
        'australia': 'AU',
        'germany': 'DE',
        'france': 'FR',
        'italy': 'IT',
        'spain': 'ES',
        'japan': 'JP',
        'china': 'CN',
        'brazil': 'BR',
        'mexico': 'MX',
        'india': 'IN',
    };
    
    const normalizedCountry = country.toLowerCase().trim();
    if (countryMap[normalizedCountry]) {
        console.log(`✅ Converted "${country}" to "${countryMap[normalizedCountry]}"`);
        return countryMap[normalizedCountry];
    }
    
    console.log(`⚠️ Unknown country "${country}", using US as default`);
    return 'US';
}

// Export the helper functions
module.exports = {
    environment,
    client: paypalClient,
    getCountryCode
};