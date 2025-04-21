const schedule = require('node-schedule');
const mongoose = require('mongoose');
const Product = require('../models/product');
const User = require('../models/user');
const emailSender = require('../helpers/email_sender');

console.log('🕒 Initializing saved items reminder scheduler');

/**
 * Process saved items that are 3 days old and send reminder emails
 */
async function processSavedItemsReminders() {
    try {
        console.log('🔍 Checking for saved items that are 3 days old...');
        
        // Calculate the date 3 days ago
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        
        console.log(`🗓️ Looking for items saved around: ${threeDaysAgo.toISOString()}`);
        
        // Find products with saved items around 3 days ago (with a small margin)
        const productsWithSavedItems = await Product.find({
            'savedForLaterBy.savedAt': {
                $gte: new Date(threeDaysAgo.getTime() - 12 * 60 * 60 * 1000), // 12 hours before
                $lte: new Date(threeDaysAgo.getTime() + 12 * 60 * 60 * 1000)  // 12 hours after
            }
        });
        
        console.log(`📦 Found ${productsWithSavedItems.length} products with potentially eligible saved items`);
        
        if (productsWithSavedItems.length === 0) {
            console.log('ℹ️ No eligible saved items found for today');
            return;
        }
        
        // Group saved items by user
        const userSavedItems = {};
        
        // Process each product to find eligible saved items
        productsWithSavedItems.forEach(product => {
            if (!product.savedForLaterBy || product.savedForLaterBy.length === 0) return;
            
            // Filter for saved items that are around 3 days old
            product.savedForLaterBy.forEach(item => {
                if (!item.userId || !item.savedAt) return;
                
                const savedDate = new Date(item.savedAt);
                const daysDiff = (Date.now() - savedDate.getTime()) / (1000 * 60 * 60 * 24);
                
                // Check if the item was saved approximately 3 days ago (between 2.75 and 3.25 days)
                if (daysDiff >= 2.75 && daysDiff <= 3.25) {
                    const userId = item.userId.toString();
                    if (!userSavedItems[userId]) {
                        userSavedItems[userId] = [];
                    }
                    
                    // Add this product to the user's saved items list
                    userSavedItems[userId].push({
                        _id: product._id,
                        title: product.title || 'Product',
                        desc: product.desc || '',
                        img: product.img || '',
                        price: product.price || 0,
                        color: product.color || '',
                        size: product.size || '',
                        savedAt: item.savedAt,
                        fromCart: item.fromCart || false
                    });
                }
            });
        });
        
        // Get the list of user IDs
        const userIds = Object.keys(userSavedItems);
        console.log(`👤 Found ${userIds.length} users with saved items from ~3 days ago`);
        
        if (userIds.length === 0) {
            console.log('ℹ️ No users have items saved exactly 3 days ago');
            return;
        }
        
        // Process each user - send reminder emails
        for (const userId of userIds) {
            try {
                // Find user details
                const user = await User.findById(userId);
                if (!user || !user.email) {
                    console.log(`⚠️ User ${userId} not found or has no email, skipping...`);
                    continue;
                }
                
                const savedProducts = userSavedItems[userId];
                console.log(`📧 Sending reminder to ${user.email} for ${savedProducts.length} saved items`);
                
                try {
                    // Send the reminder email
                    await emailSender.sendSavedItemsReminder(
                        user.email, 
                        savedProducts,
                        user.username || user.name || ''
                    );
                    
                    console.log(`✅ Successfully sent reminder email to ${user.email}`);
                } catch (emailError) {
                    console.error(`❌ Error sending email to ${user.email}:`, emailError);
                }
            } catch (userError) {
                console.error(`❌ Error processing user ${userId}:`, userError);
            }
        }
        
        console.log('✅ Saved items reminder job completed');
    } catch (error) {
        console.error('❌ Error processing saved items reminders:', error);
    }
}

// Schedule the job to run daily at 10:00 AM
const job = schedule.scheduleJob('0 10 * * *', processSavedItemsReminders);
console.log('✅ Saved items reminder scheduler initialized - will run daily at 10:00 AM');

// Also export the function for manual testing
module.exports = {
    job,
    processSavedItemsReminders
};