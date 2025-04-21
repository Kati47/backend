const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');

/**
 * PayPal Environment Configuration
 */
function environment() {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    
    console.log('🔍 PayPal Configuration:');
    console.log(`- Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`- Client ID exists: ${!!clientId}`);
    console.log(`- Client Secret exists: ${!!clientSecret}`);
    
    if (!clientId || !clientSecret) {
        console.error('❌ ERROR: Missing PayPal credentials in environment variables!');
        console.error('Please check your .env file and server configuration.');
        throw new Error('PayPal credentials missing');
    }
    
    // Validate credentials format (rough check)
    if (clientId.length < 20 || clientSecret.length < 20) {
        console.warn('⚠️ WARNING: PayPal credentials look suspicious (too short)');
    }
    
    // Attempt to create the environment
    try {
        if (process.env.NODE_ENV === 'production') {
            console.log('🚀 Using PayPal LIVE environment');
            return new checkoutNodeJssdk.core.LiveEnvironment(clientId, clientSecret);
        } else {
            console.log('🧪 Using PayPal SANDBOX environment');
            return new checkoutNodeJssdk.core.SandboxEnvironment(clientId, clientSecret);
        }
    } catch (error) {
        console.error('❌ Failed to create PayPal environment:', error);
        throw error;
    }
}

// Create PayPal client with environment configuration
function client() {
    console.log('📡 Creating PayPal HTTP client...');
    try {
        return new checkoutNodeJssdk.core.PayPalHttpClient(environment());
    } catch (error) {
        console.error('❌ Failed to create PayPal client:', error);
        throw error;
    }
}

/**
 * Convert any country format to ISO 3166-1 alpha-2 code
 * @param {string} country - Country name or code to convert
 * @returns {string} Two-letter ISO country code
 */
function getCountryCode(country) {
    if (!country) return "US";
    
    // If already a 2-letter code, return as is
    if (country.length === 2 && /^[A-Z]{2}$/.test(country)) {
        console.log(`✅ Country ${country} is already a valid ISO code`);
        return country;
    }
    
    // Common country code mappings
    const countryMap = {
        "USA": "US",
        "UNITED STATES": "US",
        "UNITED STATES OF AMERICA": "US",
        "CANADA": "CA",
        "MEXICO": "MX",
        "UK": "GB",
        "UNITED KINGDOM": "GB",
        "GREAT BRITAIN": "GB",
        "AUSTRALIA": "AU",
        "GERMANY": "DE",
        "FRANCE": "FR",
        "ITALY": "IT",
        "SPAIN": "ES",
        "JAPAN": "JP",
        "CHINA": "CN",
        "INDIA": "IN",
        "BRAZIL": "BR"
    };
    
    // Try to match the country name/code (case insensitive)
    const upperCountry = country.toUpperCase();
    const result = countryMap[upperCountry] || "US"; // Default to US
    
    console.log(`🔄 Converting country "${country}" to ISO code "${result}"`);
    return result;
}

module.exports = { client, getCountryCode };