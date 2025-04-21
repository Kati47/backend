const mongoose = require('mongoose');

const { User } = require('../models/user');
console.log('User model imported');

const {Token} = require("../models/token");
console.log('Token model imported');

const Product = require('../models/product');

exports.getUserCount = async function (req, res) {
    console.log('getUserCount function called');
    
    try {
        console.log('Attempting to count users...');
        const userCount = await User.countDocuments();
        console.log('User count result:', userCount);
        
        if (!userCount) {
            console.error('Failed to count users');
            return res.status(500).json({message: 'Could not count users'});
        }
        
        console.log('Successfully counted users:', userCount);
        return res.json({userCount});
        
    } catch (error) {
        console.error('Error in getUserCount:', error);
        return res.status(500).json({type: error.name, message: error.message});
    }
}

exports.deleteUser = async function(req, res) {
    console.log('🔴 deleteUser function called with params:', req.params);
    
    try {
        console.log('🔍 Extracting user ID from params...');
        const userId = req.params.id;
        console.log('🔑 User ID to delete:', userId);
        
        console.log('🔍 Checking if user exists...');
        const user = await User.findById(userId);
        console.log('👤 User found:', user ? 'Yes ✅' : 'No ❌');
        
        if (!user) {
            console.error('❌ User not found with ID:', userId);
            return res.status(404).json({message: 'User not Found'});
        }
        
        // Log user details for debugging
        console.log('📋 User details:');
        console.log(`   - Name: ${user.name}`);
        console.log(`   - Email: ${user.email}`);
        console.log(`   - Admin: ${user.isAdmin ? 'Yes' : 'No'}`);
        
        // STEP 1: Check for Cart model and delete any carts
        console.log('🔍 Checking for Cart model...');
        try {
            // Try to import Cart model
            const Cart = require('../models/cart');
            console.log('🛒 Cart model found, looking for user carts...');
            
            // Use the correct field name (userId not user)
            const cartResult = await Cart.deleteMany({ userId: userId });
            console.log(`🛒 Deleted ${cartResult.deletedCount} cart(s) for user`);
            
            if (cartResult.deletedCount === 0) {
                console.log('🔍 No carts found with userId, checking for ObjectId format...');
                // Try with ObjectId conversion as well
                const objectIdUserId = mongoose.Types.ObjectId(userId);
                const cartResult2 = await Cart.deleteMany({ userId: objectIdUserId });
                console.log(`🛒 Deleted ${cartResult2.deletedCount} cart(s) for user using ObjectId`);
            }
        } catch (cartError) {
            console.log('⚠️ Cart model not found or error accessing it:', cartError.message);
            console.log('🔍 Looking for alternative cart collections...');
            
            // Try with different model names in case your Cart model has a different name
            try {
                const db = mongoose.connection.db;
                const collections = await db.listCollections({ name: /cart/i }).toArray();
                
                if (collections.length > 0) {
                    console.log(`🛒 Found ${collections.length} cart-related collections`);
                    
                    for (const collection of collections) {
                        console.log(`🔍 Checking collection: ${collection.name}`);
                        const deleteResult = await db.collection(collection.name).deleteMany({ user: userId });
                        console.log(`🛒 Deleted ${deleteResult.deletedCount} documents from ${collection.name}`);
                        
                        // Also try with userId field name variation
                        const deleteResult2 = await db.collection(collection.name).deleteMany({ userId: userId });
                        console.log(`🛒 Deleted ${deleteResult2.deletedCount} documents with userId field from ${collection.name}`);
                    }
                } else {
                    console.log('⚠️ No cart collections found');
                }
            } catch (dbError) {
                console.log('⚠️ Error accessing database collections:', dbError.message);
            }
        }
        
        // STEP 2: Find affected products BEFORE removing the user references
        console.log('🔍 Finding products with user references before removing...');
        const productsWithFavorites = await Product.find({
            'favoritedBy.userId': userId
        });
        console.log(`❤️ Found ${productsWithFavorites.length} products with user in favorites`);
        
        if (productsWithFavorites.length > 0) {
            console.log('📋 Products with favorites:');
            productsWithFavorites.forEach(p => {
                console.log(`   - Product ID: ${p._id}, Title: ${p.title}`);
            });
        }
        
        const productsWithSaved = await Product.find({
            'savedForLaterBy.userId': userId
        });
        console.log(`🔖 Found ${productsWithSaved.length} products with user in saved items`);
        
        if (productsWithSaved.length > 0) {
            console.log('📋 Products with saved items:');
            productsWithSaved.forEach(p => {
                console.log(`   - Product ID: ${p._id}, Title: ${p.title}`);
            });
        }
        
        // Create a Set of unique product IDs that need updating
        const productIdsToUpdate = new Set();
        productsWithFavorites.forEach(p => productIdsToUpdate.add(p._id.toString()));
        productsWithSaved.forEach(p => productIdsToUpdate.add(p._id.toString()));
        
        console.log(`🔄 Total unique products to update: ${productIdsToUpdate.size}`);
        
        // STEP 3: Remove user from favoritedBy arrays
        console.log('🔄 Removing user from product favorites...');
        const favoriteResult = await Product.updateMany(
            { 'favoritedBy.userId': userId },
            { $pull: { favoritedBy: { userId: userId } } }
        );
        
        console.log(`✅ Updated ${favoriteResult.modifiedCount} products to remove user from favorites`);
        
        // STEP 4: Remove user from savedForLaterBy arrays
        console.log('🔄 Removing user from product saved items...');
        const savedResult = await Product.updateMany(
            { 'savedForLaterBy.userId': userId },
            { $pull: { savedForLaterBy: { userId: userId } } }
        );
        
        console.log(`✅ Updated ${savedResult.modifiedCount} products to remove user from saved items`);
        
        // STEP 5: Update counts for all affected products
        console.log('🔄 Updating product counts...');
        let productUpdateCount = 0;
        for (const productId of productIdsToUpdate) {
            const product = await Product.findById(productId);
            if (product) {
                // Update the counts based on current array lengths
                const oldFavoriteCount = product.favoriteCount || 0;
                const oldSavedCount = product.savedForLaterCount || 0;
                
                product.favoriteCount = product.favoritedBy ? product.favoritedBy.length : 0;
                product.savedForLaterCount = product.savedForLaterBy ? product.savedForLaterBy.length : 0;
                
                console.log(`🔄 Product ${product._id}:`);
                console.log(`   - Title: ${product.title}`);
                console.log(`   - Favorite count: ${oldFavoriteCount} -> ${product.favoriteCount}`);
                console.log(`   - Saved count: ${oldSavedCount} -> ${product.savedForLaterCount}`);
                
                await product.save();
                productUpdateCount++;
            } else {
                console.log(`⚠️ Product ${productId} not found`);
            }
        }
        console.log(`✅ Updated counts for ${productUpdateCount} products`);
        
        // STEP 6: Check for orders and update if needed
        console.log('🔍 Checking for Order model...');
        try {
            const Order = require('../models/order');
            console.log('🔍 Order model found, looking for user orders...');
            
            // Update orders to anonymize or mark as deleted for this user
            const ordersResult = await Order.updateMany(
                { user: userId },
                { $set: { userDeleted: true } }
            );
            console.log(`🔄 Updated ${ordersResult.modifiedCount} orders for user deletion`);
        } catch (orderError) {
            console.log('⚠️ Order model not found or error:', orderError.message);
        }
        
        // STEP 7: Delete all user tokens
        console.log('🔄 Deleting all associated tokens...');
        const tokenResult = await Token.deleteMany({ userId: userId });
        console.log(`✅ Deleted ${tokenResult.deletedCount} token(s)`);
        
        // STEP 8: Delete the user
        console.log('🔄 Deleting user document...');
        const userResult = await User.deleteOne({ _id: userId });
        
        if (userResult.deletedCount === 0) {
            console.error('❌ Failed to delete user document');
            return res.status(500).json({ message: 'Failed to delete user' });
        }
        
        console.log('✅ User document deleted successfully');
        
        // STEP 9: Double-check cleanup
        console.log('🔍 Verifying cleanup...');
        const remainingFavorites = await Product.find({ 'favoritedBy.userId': userId });
        const remainingSaved = await Product.find({ 'savedForLaterBy.userId': userId });
        
        if (remainingFavorites.length > 0 || remainingSaved.length > 0) {
            console.warn('⚠️ Some user references still remain after deletion:');
            console.warn(`   - Favorites: ${remainingFavorites.length}`);
            console.warn(`   - Saved items: ${remainingSaved.length}`);
            
            // Attempt additional cleanup if needed
            if (remainingFavorites.length > 0 || remainingSaved.length > 0) {
                console.log('🔄 Performing additional cleanup...');
                
                // Log details of remaining references
                if (remainingFavorites.length > 0) {
                    console.log('📋 Remaining favorites references:');
                    remainingFavorites.forEach(p => {
                        console.log(`   - Product: ${p._id} (${p.title})`);
                        const userRefs = p.favoritedBy.filter(f => f.userId.toString() === userId);
                        console.log(`   - User references: ${userRefs.length}`);
                    });
                }
                
                if (remainingSaved.length > 0) {
                    console.log('📋 Remaining saved items references:');
                    remainingSaved.forEach(p => {
                        console.log(`   - Product: ${p._id} (${p.title})`);
                        const userRefs = p.savedForLaterBy.filter(f => f.userId.toString() === userId);
                        console.log(`   - User references: ${userRefs.length}`);
                    });
                }
                
                // More aggressive cleanup using direct MongoDB operations
                console.log('🔄 Using direct MongoDB operations for cleanup...');
                
                const db = mongoose.connection.db;
                const productsCollection = db.collection('products');
                
                const updateFavResult = await productsCollection.updateMany(
                    {}, 
                    { $pull: { favoritedBy: { userId: mongoose.Types.ObjectId(userId) } } }
                );
                
                const updateSavedResult = await productsCollection.updateMany(
                    {}, 
                    { $pull: { savedForLaterBy: { userId: mongoose.Types.ObjectId(userId) } } }
                );
                
                console.log(`🔄 MongoDB direct operations results:`);
                console.log(`   - Favorites cleanup: ${updateFavResult.modifiedCount} products modified`);
                console.log(`   - Saved items cleanup: ${updateSavedResult.modifiedCount} products modified`);
                
                // Final check
                const finalFavorites = await Product.find({ 'favoritedBy.userId': userId });
                const finalSaved = await Product.find({ 'savedForLaterBy.userId': userId });
                
                console.log(`🔍 Final check - Remaining references:`);
                console.log(`   - Favorites: ${finalFavorites.length}`);
                console.log(`   - Saved items: ${finalSaved.length}`);
            }
        } else {
            console.log('✅ All user references successfully removed');
        }
        
        console.log('✅ User deletion completed successfully');
        return res.status(204).end();
        
    } catch (error) {
        console.error('❌ Error in deleteUser:', error);
        return res.status(500).json({
            type: error.name, 
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}

exports.getUsers = async (_, res) => {
    console.log('getUsers function called');
    
    try {
        console.log('Fetching all users with selected fields...');
        const users = await User.find().select('name email id isAdmin');
        console.log('Users found:', users ? users.length : 0);
        
        if (!users) {
            console.error('No users found');
            return res.status(404).json({ message: 'User not Found' });
        }
        
        console.log('Successfully retrieved users list');
        return res.json(users);
    }
    catch (error) {
        console.error('Error in getUsers:', error);
        return res.status(500).json({ type: error.name, message: error.message });
    }
}

exports.getUserById = async (req, res) => {
    console.log('getUserById function called with params:', req.params);
    
    try {
        console.log('Extracting user ID from params...');
        const userId = req.params.id;
        console.log('Looking up user by ID:', userId);
        
        console.log('Fetching user with excluded fields...');
        const user = await User.findById(userId).select(
            '-passwordHash -resetPasswordOtp -resetPasswordOtpExpires -cart');
        console.log('User found:', user ? 'Yes' : 'No');
        
        if (!user) {
            console.error('User not found with ID:', userId);
            return res.status(404).json({ message: 'User Not Found' });
        }
        
        console.log('Successfully retrieved user details');
        return res.json(user);
    } catch (error) {
        console.error('Error in getUserById:', error);
        return res.status(500).json({ type: error.name, message: error.message });
    }
}

exports.updateUser = async (req, res) => {
    console.log('updateUser function called with params:', req.params);
    console.log('Request body:', req.body);
    
    try {
        console.log('Extracting fields from request body...');
        const { name, email, phone } = req.body;
        console.log('Fields to update:', { name, email, phone });
        
        console.log('Finding and updating user...');
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { name, email, phone },
            { new: true }
        );
        console.log('User updated:', user ? 'Yes' : 'No');
        
        if (!user) {
            console.error('User not found with ID:', req.params.id);
            return res.status(404).json({ message: 'User Not Found' });
        }
        
        console.log('Removing sensitive fields from response...');
        user.passwordHash = undefined;
        user.cart = undefined;
        
        console.log('Successfully updated user');
        return res.json(user);
    } catch (error) {
        console.error('Error in updateUser:', error);
        return res.status(500).json({ type: error.name, message: error.message });
    }
}

exports.getUserProfile = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Not authenticated' });
        }
        
        // Return user's own information (without sensitive fields)
        const userProfile = {
            _id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            phone: req.user.phone,
            street: req.user.street,
            apartment: req.user.apartment,
            city: req.user.city,
            postalCode: req.user.postalCode,
            country: req.user.country,
            isAdmin: req.user.isAdmin
        };
        
        return res.status(200).json(userProfile);
    } catch (error) {
        console.error('Error in getUserProfile:', error);
        return res.status(500).json({ 
            message: 'Error retrieving profile',
            error: error.message
        });
    }
};