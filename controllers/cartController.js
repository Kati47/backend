const Cart = require('../models/cart');
const Product = require('../models/product');
const mongoose = require('mongoose');
const PromoCode = require('../models/promoCode');

/**
 * Add to cart - Creates a new cart or updates existing cart
 */
exports.addToCart = async (req, res) => {
    console.log('📥 Add to cart request received:', JSON.stringify({
        userId: req.body.userId,
        productsCount: req.body.products ? req.body.products.length : 0
    }));
    
    try {
        // Validate request body
        if (!req.body.userId || !req.body.products || !Array.isArray(req.body.products)) {
            console.log('❌ Invalid request - missing userId or products array');
            return res.status(400).json({ 
                message: "Invalid request. Please provide userId and products array." 
            });
        }
        
        const userId = req.body.userId;
        console.log(`✅ Request validation passed. Processing ${req.body.products.length} products...`);
        
        // Process each product to add to cart
        for (const item of req.body.products) {
            if (!item.productId) {
                console.log('❌ Product missing productId');
                return res.status(400).json({ message: "Each product must have a productId" });
            }
            
            // Check if the product is in saved for later and remove it
            try {
                const Product = require('../models/product');
                const productId = item.productId;
                
                console.log(`🔍 Checking if product ${productId} is in saved for later for user ${userId}...`);
                const product = await Product.findOne({
                    _id: productId,
                    'savedForLaterBy.userId': userId
                });
                
                if (product) {
                    console.log(`✅ Product ${productId} found in saved for later, removing...`);
                    
                    // Remove from saved for later
                    await Product.updateOne(
                        { _id: productId },
                        { $pull: { savedForLaterBy: { userId: userId } } }
                    );
                    
                    // Update saved for later count
                    const updatedProduct = await Product.findById(productId);
                    if (updatedProduct) {
                        updatedProduct.savedForLaterCount = updatedProduct.savedForLaterBy.length;
                        await updatedProduct.save();
                    }
                    
                    console.log(`✅ Product removed from saved for later successfully`);
                }
            } catch (error) {
                console.error(`❌ Error checking saved for later status:`, error);
            }
        }
        
        // Continue with the rest of your addToCart function...
        // Check if user already has a cart
        console.log(`🔍 Checking if user ${req.body.userId} already has a cart...`);
        const existingCart = await Cart.findOne({ userId: req.body.userId });
        
        if (existingCart) {
            console.log(`🔄 Found existing cart with ID ${existingCart._id} for user ${req.body.userId}`);
            console.log(`Current product count: ${existingCart.products.length}`);
        } else {
            console.log(`🆕 No existing cart found. Will create new cart for user ${req.body.userId}`);
        }

        // Process each product in the cart to include all attributes
        const enrichedProducts = [];
        console.log('🔄 Processing products and fetching details from database...');
        
        for (const item of req.body.products) {
            // Check if we have the productId
            if (!item.productId) {
                console.log('❌ Product missing productId');
                return res.status(400).json({ message: "Each product must have a productId" });
            }
            
            console.log(`🔍 Fetching details for product ID: ${item.productId}`);
            
            // Validate ObjectId format
            if (!mongoose.Types.ObjectId.isValid(item.productId)) {
                console.log(`❌ Invalid product ID format: ${item.productId}`);
                return res.status(400).json({ 
                    message: `Invalid product ID format: ${item.productId}` 
                });
            }
            
            // Fetch the product from database to get all its details
            const productDetails = await Product.findById(item.productId);
            
            if (!productDetails) {
                console.log(`❌ Product not found in database: ${item.productId}`);
                return res.status(404).json({ 
                    message: `Product with id ${item.productId} not found` 
                });
            }
            
            console.log(`✅ Product found: ${productDetails.title} (${item.productId})`);
            
            // Add product details along with quantity to the cart
            enrichedProducts.push({
                productId: item.productId,
                quantity: item.quantity || 1,
                title: productDetails.title,
                desc: productDetails.desc,
                img: productDetails.img,
                categories: productDetails.categories,
                size: productDetails.size,
                color: productDetails.color,
                price: productDetails.price
            });
            
            console.log(`➕ Added to enriched products: ${productDetails.title}, quantity: ${item.quantity || 1}`);
        }
        
        console.log(`✅ All products processed. Total enriched products: ${enrichedProducts.length}`);
        
        let savedCart;
        
        // Update existing cart or create new one
        if (existingCart) {
            console.log(`🔄 Updating existing cart ${existingCart._id} with new products`);
            
            // Create a map of existing products by productId for easy lookup
            const existingProductsMap = {};
            existingCart.products.forEach(product => {
                existingProductsMap[product.productId.toString()] = product;
            });
            
            // Process each new product
            for (const newProduct of enrichedProducts) {
                const productId = newProduct.productId.toString();
                
                // Check if product already exists in cart
                if (existingProductsMap[productId]) {
                    console.log(`🔄 Product ${productId} already exists in cart, updating quantity`);
                    // Update existing product quantity
                    existingProductsMap[productId].quantity += newProduct.quantity;
                } else {
                    console.log(`➕ Adding new product ${productId} to cart`);
                    // Add new product to cart
                    existingCart.products.push(newProduct);
                }
            }
            
            // Save the updated cart
            savedCart = await existingCart.save();
            console.log(`✅ Cart updated successfully with ${savedCart.products.length} products`);
        } else {
            // Create new cart with complete product details
            console.log(`🆕 Creating new cart for user ${req.body.userId}`);
            const newCart = new Cart({
                userId: req.body.userId,
                products: enrichedProducts
            });
            
            // Save the cart to the database
            savedCart = await newCart.save();
            console.log(`✅ New cart created with ID: ${savedCart._id}`);
        }
        
        // Return the saved cart
        console.log('📤 Sending cart data in response');
        res.status(existingCart ? 200 : 201).json({
            message: existingCart ? "Cart updated successfully" : "Cart created successfully",
            cart: savedCart
        });
        
    } catch (error) {
        console.error("❌ Error processing cart:", error);
        res.status(500).json({ 
            message: "Something went wrong", 
            error: error.message 
        });
    }
};

/**
 * Update cart by ID
 */
exports.updateCart = async (req, res) => {
    console.log(`📝 Update cart request received for cart ID: ${req.params.id}`);
    
    try {
        // Check if the cart exists before updating
        console.log(`🔍 Checking if cart ${req.params.id} exists...`);
        const cartExists = await Cart.findById(req.params.id);
        
        if (!cartExists) {
            console.log(`❌ Cart not found: ${req.params.id}`);
            return res.status(404).json({ message: "Cart not found" });
        }
        
        console.log(`✅ Cart found. Proceeding with update...`);
        
        // If updating products, validate them
        if (req.body.products && Array.isArray(req.body.products)) {
            console.log(`🔄 Validating ${req.body.products.length} products in update request...`);
            
            for (const product of req.body.products) {
                if (!product.productId) {
                    console.log('❌ Product in update missing productId');
                    return res.status(400).json({ message: "Each product must have a productId" });
                }
            }
            
            console.log(`✅ All products in update request are valid`);
        }
        
        // Find the cart by ID and update it with the new data from the request body
        console.log(`🔄 Updating cart ${req.params.id}...`);
        const updatedCart = await Cart.findByIdAndUpdate(
            req.params.id,
            {
                $set: req.body,
            },
            { new: true }
        );
        
        console.log(`✅ Cart updated successfully: ${updatedCart._id}`);
        
        // If successful, send a response with the updated cart data
        res.status(200).json({
            message: "Cart updated successfully",
            cart: updatedCart
        });

    } catch (error) {
        // If an error occurs, log the error and return a 500 server error response
        console.error(`❌ Error updating cart:`, error);
        return res.status(500).json({
            message: "Failed to update cart",
            error: error.message
        });
    }
};

/**
 * Delete cart by ID
 */
exports.deleteCart = async (req, res) => {
    console.log(`🗑️ Delete cart request received for cart ID: ${req.params.id}`);

    try {
        // Check if the cart exists before deleting
        console.log(`🔍 Checking if cart ${req.params.id} exists...`);
        const cartExists = await Cart.findById(req.params.id);
        
        if (!cartExists) {
            console.log(`❌ Cart not found: ${req.params.id}`);
            return res.status(404).json({ message: "Cart not found" });
        }
        
        console.log(`✅ Cart found. Proceeding with deletion...`);
        
        // Find the cart by ID and delete it from the database
        await Cart.findByIdAndDelete(req.params.id);
        
        // If successful, send a success message
        console.log(`✅ Cart ${req.params.id} has been deleted`);
        return res.status(200).json({
            message: "Cart has been deleted successfully"
        });

    } catch (error) {
        // If an error occurs, log the error and return a 500 server error response
        console.error(`❌ Error deleting cart:`, error);
        return res.status(500).json({
            message: "Failed to delete cart",
            error: error.message
        });
    }
};

/**
 * Find cart by userId
 */
exports.getCartByUserId = async (req, res) => {
    const userId = req.params.userId;
    console.log(`🔍 Find cart request received for user ID: ${userId}`);
    
    try {
        // Try to convert to ObjectId if possible
        let objectId;
        try {
            if (mongoose.Types.ObjectId.isValid(userId)) {
                objectId = new mongoose.Types.ObjectId(userId);
                console.log(`✅ Successfully converted to ObjectId: ${objectId}`);
            } else {
                console.log(`⚠️ User ID is not a valid ObjectId format: ${userId}`);
            }
        } catch (e) {
            console.log(`⚠️ Error converting to ObjectId: ${e.message}`);
        }
        
        console.log(`🔍 Searching for cart with userId: ${userId}`);
        
        // Search with multiple criteria to handle potential format differences
        let cart;
        
        // First try with ObjectId if we have one
        if (objectId) {
            console.log(`🔍 Searching by ObjectId: ${objectId}`);
            cart = await Cart.findOne({ userId: objectId });
            if (cart) {
                console.log(`✅ Cart found using ObjectId`);
            }
        }
        
        // If no cart found, try with string
        if (!cart) {
            console.log(`🔍 Searching by string ID: ${userId}`);
            cart = await Cart.findOne({ userId: userId });
            if (cart) {
                console.log(`✅ Cart found using string ID`);
            }
        }
        
        // Logging all carts for debugging if no cart found
        if (!cart) {
            console.log(`⚠️ Cart not found, getting all carts for debugging...`);
            const allCarts = await Cart.find({}).lean();
            
            console.log(`📊 Found ${allCarts.length} total carts in system`);
            
            if (allCarts.length > 0) {
                const cartInfo = allCarts.map(c => ({
                    cartId: c._id.toString(),
                    userId: c.userId.toString(),
                    productsCount: c.products.length
                }));
                console.log(`📋 Available carts:`, JSON.stringify(cartInfo, null, 2));
            } else {
                console.log(`📋 No carts found in the database`);
            }
            
            console.log(`❌ No cart found for user ${userId}`);
            return res.status(404).json({ message: 'Cart not found' });
        }
        
        console.log(`✅ Cart found successfully. Cart ID: ${cart._id}, Products: ${cart.products.length}`);
        
        // Return the cart
        return res.status(200).json({
            message: "Cart found successfully",
            cart: cart
        });
    } catch (error) {
        console.error(`❌ Error finding cart:`, error);
        return res.status(500).json({ 
            message: 'Internal server error', 
            error: error.message 
        });
    }
};

/**
 * Get all carts (admin only)
 */
exports.getAllCarts = async (req, res) => {
    console.log(`📋 Find all carts request received`);
    
    try {
        // Retrieve all carts from the database
        console.log(`🔍 Fetching all carts from database...`);
        const carts = await Cart.find();
        
        console.log(`✅ Found ${carts.length} carts`);
        
        // If successful, send a response with all cart data
        res.status(200).json({
            message: `Found ${carts.length} carts`,
            carts: carts
        });

    } catch (error) {
        // If an error occurs, log the error and return a 500 server error response
        console.error(`❌ Error retrieving all carts:`, error);
        res.status(500).json({
            message: "Failed to retrieve carts",
            error: error.message
        });
    }
};

/**
 * Get cart statistics
 */
exports.getCartStats = async (req, res) => {
    console.log(`📊 Cart statistics request received`);
    
    try {
        // Get counts and basic stats
        const cartCount = await Cart.countDocuments();
        const productCount = await Product.countDocuments();
        const carts = await Cart.find().lean();
        
        // Calculate additional stats
        const totalProducts = carts.reduce((sum, cart) => sum + cart.products.length, 0);
        const cartsWithProducts = carts.filter(cart => cart.products.length > 0).length;
        const emptyCartsCount = carts.filter(cart => cart.products.length === 0).length;
        
        // Get user counts for each cart
        const userCounts = {};
        carts.forEach(cart => {
            const userId = cart.userId.toString();
            userCounts[userId] = (userCounts[userId] || 0) + 1;
        });
        
        // Find users with multiple carts
        const usersWithMultipleCartsCount = Object.values(userCounts).filter(count => count > 1).length;
        
        console.log(`📊 Generated cart statistics`);
        
        res.status(200).json({
            totalCarts: cartCount,
            totalProducts: productCount,
            totalProductsInCarts: totalProducts,
            cartsWithProducts: cartsWithProducts,
            emptyCartsCount: emptyCartsCount,
            usersWithMultipleCartsCount: usersWithMultipleCartsCount,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(`❌ Error generating cart statistics:`, error);
        res.status(500).json({
            message: "Failed to generate cart statistics",
            error: error.message
        });
    }
};

/**
 * Apply promo code to cart
 */
exports.applyPromoCode = async (req, res) => {
    console.log('🎟️ Apply promo code request received');
    console.log('📦 Request body:', req.body);
    
    try {
        const { userId, promoCode: code } = req.body;
        
        // Validate required fields
        if (!userId || !code) {
            console.log('❌ Missing required fields');
            return res.status(400).json({ message: "userId and promoCode are required" });
        }
        
        // Find user's cart
        console.log(`🔍 Looking for user cart with userId: ${userId}`);
        
        const userObjectId = mongoose.Types.ObjectId.isValid(userId) 
            ? new mongoose.Types.ObjectId(userId) 
            : userId;
            
        const cart = await Cart.findOne({ userId: userObjectId });
        
        if (!cart) {
            console.log(`❌ Cart not found for user: ${userId}`);
            return res.status(404).json({ message: "Cart not found" });
        }
        
        console.log(`✅ Found cart with ID: ${cart._id}`);
        
        // Check if cart has products
        if (!cart.products || cart.products.length === 0) {
            console.log('❌ Cannot apply promo code to empty cart');
            return res.status(400).json({ message: "Cannot apply promo code to empty cart" });
        }
        
        // Find the promo code
        console.log(`🔍 Looking for promo code: ${code}`);
        const promo = await PromoCode.findOne({ code: code.toUpperCase() });
        
        if (!promo) {
            console.log(`❌ Promo code not found: ${code}`);
            return res.status(404).json({ message: "Promo code not found" });
        }
        
        console.log(`✅ Found promo code: ${promo.code}`);
        
        // Check if promo code is valid
        const now = new Date();
        
        if (!promo.isActive) {
            console.log(`❌ Promo code is inactive: ${code}`);
            return res.status(400).json({ message: "This promo code is no longer active" });
        }
        
        if (now < promo.startDate) {
            console.log(`❌ Promo code not yet valid: ${code}`);
            return res.status(400).json({ 
                message: `This promo code is not valid until ${promo.startDate.toDateString()}` 
            });
        }
        
        if (now > promo.endDate) {
            console.log(`❌ Promo code expired: ${code}`);
            return res.status(400).json({ 
                message: `This promo code expired on ${promo.endDate.toDateString()}` 
            });
        }
        
        // Check usage limits
        if (promo.usageLimit !== null && promo.currentUsage >= promo.usageLimit) {
            console.log(`❌ Promo code usage limit reached: ${code}`);
            return res.status(400).json({ message: "This promo code has reached its usage limit" });
        }
        
        // Check if user has already used this promo code
        if (promo.userUsageLimit !== null) {
            const userUsageRecord = promo.userUsage.find(
                usage => usage.userId.toString() === userId.toString()
            );
            
            if (userUsageRecord && userUsageRecord.usageCount >= promo.userUsageLimit) {
                console.log(`❌ User has already used this promo code: ${userId}`);
                return res.status(400).json({ 
                    message: `You have already used this promo code ${userUsageRecord.usageCount} times` 
                });
            }
        }
        
        // Calculate cart subtotal
        const subtotal = cart.products.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);
        
        console.log(`💰 Cart subtotal: $${subtotal.toFixed(2)}`);
        
        // Check minimum order value
        if (subtotal < promo.minOrderValue) {
            console.log(`❌ Order value too low for promo code: ${subtotal} < ${promo.minOrderValue}`);
            return res.status(400).json({ 
                message: `This promo code requires a minimum order of $${promo.minOrderValue.toFixed(2)}` 
            });
        }
        
        // Apply promo code discount
        let discount = 0;
        let discountMessage = '';
        
        console.log(`🔄 Applying promo code of type: ${promo.type}`);
        
        switch(promo.type) {
            case 'percentage':
                discount = (subtotal * (promo.value / 100));
                discountMessage = `${promo.value}% off`;
                
                // Apply max discount if specified
                if (promo.maxDiscount !== null && discount > promo.maxDiscount) {
                    console.log(`💰 Discount capped at maximum: $${promo.maxDiscount.toFixed(2)}`);
                    discount = promo.maxDiscount;
                    discountMessage += ` (max $${promo.maxDiscount.toFixed(2)})`;
                }
                break;
                
            case 'fixed_amount':
                discount = Math.min(promo.value, subtotal);
                discountMessage = `$${promo.value.toFixed(2)} off`;
                break;
                
            case 'free_shipping':
                // This will be handled at checkout
                discount = 0;
                discountMessage = 'Free shipping';
                break;
                
            case 'buy_x_get_y':
                // Simplified BOGOF implementation
                discount = 0;
                discountMessage = 'Buy X Get Y offer applied';
                break;
                
            default:
                discount = 0;
                discountMessage = 'Promo applied';
        }
        
        // Round to 2 decimal places
        discount = parseFloat(discount.toFixed(2));
        console.log(`💰 Calculated discount: $${discount.toFixed(2)}`);
        
        // Update cart with promo code and discount
        cart.promoCode = {
            code: promo.code,
            promoId: promo._id,
            discountAmount: discount,
            discountType: promo.type,
            message: discountMessage
        };
        
        // Calculate final totals
        cart.subtotal = subtotal;
        cart.total = parseFloat((subtotal - discount).toFixed(2));
        
        console.log(`💾 Saving updated cart with promo code applied...`);
        const updatedCart = await cart.save();
        
        console.log(`✅ Promo code ${promo.code} successfully applied to cart`);
        
        res.status(200).json({
            message: `Promo code applied successfully: ${discountMessage}`,
            cart: updatedCart
        });
        
    } catch (error) {
        console.error('❌ Error applying promo code:', error);
        res.status(500).json({
            message: "Failed to apply promo code",
            error: error.message
        });
    }
};

/**
 * Remove promo code from cart
 */
exports.removePromoCode = async (req, res) => {
    console.log('🎟️ Remove promo code request received');
    console.log('📦 Request body:', req.body);
    
    try {
        const { userId } = req.body;
        
        // Validate required field
        if (!userId) {
            console.log('❌ Missing required field: userId');
            return res.status(400).json({ message: "userId is required" });
        }
        
        // Find user's cart
        console.log(`🔍 Looking for user cart with userId: ${userId}`);
        
        const userObjectId = mongoose.Types.ObjectId.isValid(userId) 
            ? new mongoose.Types.ObjectId(userId) 
            : userId;
            
        const cart = await Cart.findOne({ userId: userObjectId });
        
        if (!cart) {
            console.log(`❌ Cart not found for user: ${userId}`);
            return res.status(404).json({ message: "Cart not found" });
        }
        
        console.log(`✅ Found cart with ID: ${cart._id}`);
        
        // Check if cart has a promo code
        if (!cart.promoCode || !cart.promoCode.code) {
            console.log('ℹ️ No promo code applied to cart');
            return res.status(400).json({ message: "No promo code applied to cart" });
        }
        
        const promoCodeToRemove = cart.promoCode.code;
        
        // Calculate cart subtotal
        const subtotal = cart.products.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);
        
        // Update cart by removing promo code and discount
        cart.promoCode = null;
        cart.subtotal = subtotal;
        cart.total = subtotal;
        
        console.log(`💾 Saving updated cart with promo code removed...`);
        const updatedCart = await cart.save();
        
        console.log(`✅ Promo code ${promoCodeToRemove} successfully removed from cart`);
        
        res.status(200).json({
            message: "Promo code removed successfully",
            cart: updatedCart
        });
        
    } catch (error) {
        console.error('❌ Error removing promo code:', error);
        res.status(500).json({
            message: "Failed to remove promo code",
            error: error.message
        });
    }
};

/**
 * Validate promo code (without applying it)
 */
exports.validatePromoCode = async (req, res) => {
    console.log('🎟️ Validate promo code request received');
    console.log('📦 Request body:', req.body);
    
    try {
        const { userId, promoCode: code } = req.body;
        
        // Validate required fields
        if (!userId || !code) {
            console.log('❌ Missing required fields');
            return res.status(400).json({ message: "userId and promoCode are required" });
        }
        
        // Find user's cart
        console.log(`🔍 Looking for user cart with userId: ${userId}`);
        
        const userObjectId = mongoose.Types.ObjectId.isValid(userId) 
            ? new mongoose.Types.ObjectId(userId) 
            : userId;
            
        const cart = await Cart.findOne({ userId: userObjectId });
        
        if (!cart) {
            console.log(`❌ Cart not found for user: ${userId}`);
            return res.status(404).json({ message: "Cart not found" });
        }
        
        // Find the promo code
        console.log(`🔍 Looking for promo code: ${code}`);
        const promo = await PromoCode.findOne({ code: code.toUpperCase() });
        
        if (!promo) {
            console.log(`❌ Promo code not found: ${code}`);
            return res.status(404).json({ 
                valid: false,
                message: "Promo code not found" 
            });
        }
        
        // Check if promo code is valid
        const now = new Date();
        let validationMessage = '';
        let isValid = true;
        
        // Active check
        if (!promo.isActive) {
            console.log(`❌ Promo code is inactive: ${code}`);
            validationMessage = "This promo code is no longer active";
            isValid = false;
        }
        // Start date check
        else if (now < promo.startDate) {
            console.log(`❌ Promo code not yet valid: ${code}`);
            validationMessage = `This promo code is not valid until ${promo.startDate.toDateString()}`;
            isValid = false;
        }
        // End date check
        else if (now > promo.endDate) {
            console.log(`❌ Promo code expired: ${code}`);
            validationMessage = `This promo code expired on ${promo.endDate.toDateString()}`;
            isValid = false;
        }
        
        // Calculate cart subtotal
        const subtotal = cart.products.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);
        
        // Minimum order value check
        if (isValid && subtotal < promo.minOrderValue) {
            console.log(`❌ Order value too low for promo code: ${subtotal} < ${promo.minOrderValue}`);
            validationMessage = `This promo code requires a minimum order of $${promo.minOrderValue.toFixed(2)}`;
            isValid = false;
        }
        
        // Calculate potential discount
        let discount = 0;
        let discountMessage = '';
        
        if (isValid) {
            switch(promo.type) {
                case 'percentage':
                    discount = (subtotal * (promo.value / 100));
                    discountMessage = `${promo.value}% off`;
                    
                    // Apply max discount if specified
                    if (promo.maxDiscount !== null && discount > promo.maxDiscount) {
                        discount = promo.maxDiscount;
                        discountMessage += ` (max $${promo.maxDiscount.toFixed(2)})`;
                    }
                    break;
                    
                case 'fixed_amount':
                    discount = Math.min(promo.value, subtotal);
                    discountMessage = `$${promo.value.toFixed(2)} off`;
                    break;
                    
                case 'free_shipping':
                    discount = 0;
                    discountMessage = 'Free shipping';
                    break;
                    
                case 'buy_x_get_y':
                    discount = 0;
                    discountMessage = 'Buy X Get Y offer applied';
                    break;
                    
                default:
                    discount = 0;
                    discountMessage = 'Promo applied';
            }
            
            discount = parseFloat(discount.toFixed(2));
            validationMessage = `Promo code valid: ${discountMessage}`;
        }
        
        console.log(`✅ Promo code validation completed: ${isValid ? 'Valid' : 'Invalid'}`);
        
        res.status(200).json({
            valid: isValid,
            message: validationMessage,
            promoCode: isValid ? {
                code: promo.code,
                type: promo.type,
                value: promo.value,
                discount: discount,
                discountMessage: discountMessage,
                description: promo.description
            } : null
        });
        
    } catch (error) {
        console.error('❌ Error validating promo code:', error);
        res.status(500).json({
            valid: false,
            message: "Failed to validate promo code",
            error: error.message
        });
    }
};