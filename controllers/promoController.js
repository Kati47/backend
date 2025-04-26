const PromoCode = require('../models/promoCode');
const mongoose = require('mongoose');

console.log('🎟️ Initializing Promo Code controller');

// Create a new promo code
exports.createPromoCode = async (req, res) => {
    console.log('📥 Create promo code request received');
    console.log('📦 Request body:', req.body);

    try {
        const {
            code,
            type,
            value,
            minOrderValue,
            maxDiscount,
            startDate,
            endDate,
            usageLimit,
            userUsageLimit,
            applicableProducts,
            applicableCategories,
            excludedProducts,
            excludedCategories,
            firstTimeOnly,
            description
        } = req.body;

        // Validate required fields
        if (!code || !type) {
            console.log('❌ Missing required fields');
            return res.status(400).json({ message: "Code and type are required" });
        }

        // Check if code already exists
        const existingCode = await PromoCode.findOne({ code: code.toUpperCase() });
        if (existingCode) {
            console.log(`❌ Promo code already exists: ${code}`);
            return res.status(400).json({ message: "Promo code already exists" });
        }

        // Create new promo code
        const newPromoCode = new PromoCode({
            code,
            type,
            value,
            minOrderValue: minOrderValue || 0,
            maxDiscount,
            startDate: startDate || new Date(),
            endDate,
            usageLimit,
            userUsageLimit,
            applicableProducts: Array.isArray(applicableProducts) ? applicableProducts : [],
            applicableCategories: Array.isArray(applicableCategories) ? applicableCategories : [],
            excludedProducts: Array.isArray(excludedProducts) ? excludedProducts : [],
            excludedCategories: Array.isArray(excludedCategories) ? excludedCategories : [],
            firstTimeOnly: firstTimeOnly || false,
            description,
            createdBy: req.user ? req.user._id : null // Assumes req.user is set by auth middleware
        });

        const savedPromoCode = await newPromoCode.save();
        console.log(`✅ Promo code created successfully: ${savedPromoCode.code}`);
        res.status(201).json(savedPromoCode);
    } catch (error) {
        console.error('❌ Error creating promo code:', error);
        res.status(500).json({
            message: "Failed to create promo code",
            error: error.message
        });
    }
};

// Get all promo codes with filtering and pagination
exports.getAllPromoCodes = async (req, res) => {
    console.log('🔍 Get all promo codes request received');
    console.log('📋 Query params:', req.query);

    try {
        const {
            page = 1,
            limit = 20,
            isActive,
            type,
            code,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            includeExpired = false
        } = req.query;

        // Build query filters
        const filter = {};
        
        if (code) {
            filter.code = new RegExp(code, 'i');
        }
        
        if (type) {
            filter.type = type;
        }
        
        if (isActive !== undefined) {
            filter.isActive = isActive === 'true';
        }
        
        // Don't include expired promo codes by default
        if (includeExpired !== 'true') {
            filter.endDate = { $gte: new Date() };
        }

        // Count total promo codes matching filter
        const totalPromoCodes = await PromoCode.countDocuments(filter);
        
        // Set up pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortDirection = sortOrder === 'desc' ? -1 : 1;
        
        // Execute query with pagination
        const promoCodes = await PromoCode.find(filter)
            .sort({ [sortBy]: sortDirection })
            .skip(skip)
            .limit(parseInt(limit));

        console.log(`✅ Found ${promoCodes.length} promo codes`);
        
        // Return results with pagination info
        res.status(200).json({
            promoCodes,
            totalPages: Math.ceil(totalPromoCodes / parseInt(limit)),
            currentPage: parseInt(page),
            totalPromoCodes
        });
    } catch (error) {
        console.error('❌ Error fetching promo codes:', error);
        res.status(500).json({
            message: "Failed to fetch promo codes",
            error: error.message
        });
    }
};

// Get a specific promo code by ID
exports.getPromoCodeById = async (req, res) => {
    console.log(`🔍 Get promo code by ID: ${req.params.id}`);

    try {
        // Validate object ID
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            console.log(`❌ Invalid promo code ID format: ${req.params.id}`);
            return res.status(400).json({ message: "Invalid promo code ID format" });
        }

        const promoCode = await PromoCode.findById(req.params.id);
        
        if (!promoCode) {
            console.log(`❌ Promo code not found: ${req.params.id}`);
            return res.status(404).json({ message: "Promo code not found" });
        }

        console.log(`✅ Promo code found: ${promoCode.code}`);
        res.status(200).json(promoCode);
    } catch (error) {
        console.error('❌ Error fetching promo code by ID:', error);
        res.status(500).json({
            message: "Failed to fetch promo code",
            error: error.message
        });
    }
};

// Get a specific promo code by code value
exports.getPromoCodeByCode = async (req, res) => {
    console.log(`🔍 Get promo code by code value: ${req.params.code}`);

    try {
        const code = req.params.code.toUpperCase();
        const promoCode = await PromoCode.findOne({ code });
        
        if (!promoCode) {
            console.log(`❌ Promo code not found: ${code}`);
            return res.status(404).json({ message: "Promo code not found" });
        }

        console.log(`✅ Promo code found: ${promoCode.code}`);
        res.status(200).json(promoCode);
    } catch (error) {
        console.error('❌ Error fetching promo code by code value:', error);
        res.status(500).json({
            message: "Failed to fetch promo code",
            error: error.message
        });
    }
};

// Update a promo code
exports.updatePromoCode = async (req, res) => {
    console.log(`📝 Update promo code: ${req.params.id}`);
    console.log('📦 Request body:', req.body);

    try {
        // Validate object ID
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            console.log(`❌ Invalid promo code ID format: ${req.params.id}`);
            return res.status(400).json({ message: "Invalid promo code ID format" });
        }

        // Get the existing promo code to check date validation
        const existingPromo = await PromoCode.findById(req.params.id);
        if (!existingPromo) {
            console.log(`❌ Promo code not found: ${req.params.id}`);
            return res.status(404).json({ message: "Promo code not found" });
        }

        // If trying to update code, check it doesn't conflict with existing codes
        if (req.body.code) {
            const code = req.body.code.toUpperCase();
            const existingCode = await PromoCode.findOne({ 
                code, 
                _id: { $ne: req.params.id } // Exclude current code
            });
            
            if (existingCode) {
                console.log(`❌ Promo code already exists: ${code}`);
                return res.status(400).json({ message: "This promo code already exists" });
            }
            
            // Force uppercase
            req.body.code = code;
        }

        // Handle date validation manually
        const updateData = { ...req.body };

        // Convert dates properly - always work with both dates together
        let startDate = existingPromo.startDate;
        let endDate = existingPromo.endDate;

        // Only update the dates that came in the request
        if (updateData.startDate) {
            startDate = new Date(updateData.startDate);
        }
        
        if (updateData.endDate) {
            endDate = new Date(updateData.endDate);
        }

        // Check if the dates are valid before updating
        if (endDate <= startDate) {
            console.log(`❌ Invalid date range: end date must be after start date`);
            return res.status(400).json({ 
                message: "End date must be after start date" 
            });
        }

        // Set both dates in the update data to ensure they're valid together
        updateData.startDate = startDate;
        updateData.endDate = endDate;

        // Update the promo code - use findOne and save to ensure proper validation
        const promoToUpdate = await PromoCode.findById(req.params.id);
        
        // Update fields from updateData
        Object.keys(updateData).forEach(key => {
            promoToUpdate[key] = updateData[key];
        });
        
        // Save with validation
        const updatedPromoCode = await promoToUpdate.save();

        console.log(`✅ Promo code updated successfully: ${updatedPromoCode.code}`);
        res.status(200).json(updatedPromoCode);
    } catch (error) {
        console.error('❌ Error updating promo code:', error);
        res.status(500).json({
            message: "Failed to update promo code",
            error: error.message
        });
    }
};
// Delete a promo code
exports.deletePromoCode = async (req, res) => {
    console.log(`🗑️ Delete promo code: ${req.params.id}`);

    try {
        // Validate object ID
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            console.log(`❌ Invalid promo code ID format: ${req.params.id}`);
            return res.status(400).json({ message: "Invalid promo code ID format" });
        }

        const deletedPromoCode = await PromoCode.findByIdAndDelete(req.params.id);
        
        if (!deletedPromoCode) {
            console.log(`❌ Promo code not found: ${req.params.id}`);
            return res.status(404).json({ message: "Promo code not found" });
        }

        console.log(`✅ Promo code deleted successfully: ${deletedPromoCode.code}`);
        res.status(200).json({ message: "Promo code deleted successfully" });
    } catch (error) {
        console.error('❌ Error deleting promo code:', error);
        res.status(500).json({
            message: "Failed to delete promo code",
            error: error.message
        });
    }
};

// Validate a promo code and return discount info
exports.validatePromoCode = async (req, res) => {
    console.log('🔍 Validate promo code request received');
    console.log('📦 Request body:', req.body);

    try {
        const { code, userId, cartItems, cartSubtotal } = req.body;
        
        if (!code) {
            console.log('❌ No promo code provided');
            return res.status(400).json({ message: "Promo code is required" });
        }
        
        if (!userId) {
            console.log('❌ No user ID provided');
            return res.status(400).json({ message: "User ID is required" });
        }

        // Find the promo code (case-insensitive)
        const promoCode = await PromoCode.findOne({ code: code.toUpperCase() });
        
        if (!promoCode) {
            console.log(`❌ Promo code not found: ${code}`);
            return res.status(404).json({ message: "Invalid promo code" });
        }
        
        // Check if the promo code is active
        if (!promoCode.isActive) {
            console.log(`❌ Promo code is inactive: ${code}`);
            return res.status(400).json({ message: "This promo code is inactive" });
        }
        
        // Check if the promo code is expired
        if (promoCode.isExpired) {
            console.log(`❌ Promo code is expired: ${code}`);
            return res.status(400).json({ message: "This promo code has expired" });
        }
        
        // Check if start date is in the future
        const now = new Date();
        if (now < promoCode.startDate) {
            console.log(`❌ Promo code is not yet active: ${code}`);
            return res.status(400).json({ message: "This promo code is not yet active" });
        }
        
        // Check if the usage limit is reached
        if (promoCode.isUsageLimitReached) {
            console.log(`❌ Promo code usage limit reached: ${code}`);
            return res.status(400).json({ message: "This promo code has reached its usage limit" });
        }
        
        // Check if the user is eligible to use this promo code
        if (!promoCode.canBeUsedByUser(userId)) {
            console.log(`❌ User has reached their usage limit for this promo: ${code}`);
            return res.status(400).json({ 
                message: "You have already used this promo code the maximum number of times"
            });
        }
        
        // If cart details are provided, calculate the discount
        let discountInfo = { discountAmount: 0, message: 'Valid promo code' };
        
        if (cartItems && cartSubtotal !== undefined) {
            discountInfo = promoCode.calculateDiscount(cartItems, cartSubtotal);
            console.log(`💰 Calculated discount: ${discountInfo.discountAmount}`);
        }
        
        // Return validation success
        console.log(`✅ Promo code validated: ${code}`);
        res.status(200).json({
            valid: true,
            promoCode: {
                _id: promoCode._id,
                code: promoCode.code,
                type: promoCode.type,
                value: promoCode.value,
                description: promoCode.description
            },
            discountAmount: discountInfo.discountAmount,
            message: discountInfo.message
        });
    } catch (error) {
        console.error('❌ Error validating promo code:', error);
        res.status(500).json({
            message: "Failed to validate promo code",
            error: error.message
        });
    }
};

// Apply a promo code to a cart
exports.applyPromoCode = async (req, res) => {
    console.log('🔍 Apply promo code to cart request received');
    console.log('📦 Request body:', req.body);
    
    try {
        const { code, userId, cartId } = req.body;
        
        if (!code || !userId || !cartId) {
            console.log('❌ Missing required fields');
            return res.status(400).json({ 
                message: "Promo code, user ID, and cart ID are required" 
            });
        }
        
        // Find the cart
        const Cart = require('../models/cart'); // Import Cart model
        const cart = await Cart.findById(cartId);
        
        if (!cart) {
            console.log(`❌ Cart not found: ${cartId}`);
            return res.status(404).json({ message: "Cart not found" });
        }
        
        // Check if cart belongs to the user
        if (cart.userId.toString() !== userId.toString()) {
            console.log(`❌ Cart does not belong to user: ${userId}`);
            return res.status(403).json({ message: "Not authorized to modify this cart" });
        }
        
        // Find the promo code
        const promoCode = await PromoCode.findOne({ code: code.toUpperCase() });
        
        if (!promoCode) {
            console.log(`❌ Promo code not found: ${code}`);
            return res.status(404).json({ message: "Invalid promo code" });
        }
        
        // Perform all validation checks
        if (!promoCode.isValid) {
            console.log(`❌ Promo code is not valid: ${code}`);
            return res.status(400).json({ 
                message: promoCode.isExpired ? "This promo code has expired" : "This promo code is not active" 
            });
        }
        
        if (promoCode.isUsageLimitReached) {
            console.log(`❌ Promo code usage limit reached: ${code}`);
            return res.status(400).json({ message: "This promo code has reached its usage limit" });
        }
        
        if (!promoCode.canBeUsedByUser(userId)) {
            console.log(`❌ User has reached their usage limit for this promo: ${code}`);
            return res.status(400).json({ 
                message: "You have already used this promo code the maximum number of times"
            });
        }
        
        // Calculate subtotal from cart items
        const cartSubtotal = cart.products.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);
        
        // Calculate discount based on promo code
        const discountInfo = promoCode.calculateDiscount(cart.products, cartSubtotal);
        
        if (discountInfo.discountAmount <= 0) {
            console.log(`❌ No discount applicable: ${discountInfo.message}`);
            return res.status(400).json({ message: discountInfo.message });
        }
        
        // Apply promo code to cart - FIX HERE
        cart.promoCode = {
            code: promoCode.code,
            promoId: promoCode._id,
            discountAmount: discountInfo.discountAmount,
            discountType: promoCode.type,
            message: discountInfo.message
        };
        
        console.log('📝 Updated cart promo code:', cart.promoCode);
        
        // Save the updated cart
        await cart.save();
        
        console.log(`✅ Promo code applied to cart: ${code}`);
        
        // Return updated cart with discount info
        res.status(200).json({
            message: "Promo code applied successfully",
            promoCode: cart.promoCode,
            cartTotal: {
                subtotal: cartSubtotal,
                discount: discountInfo.discountAmount,
                total: cartSubtotal - discountInfo.discountAmount
            }
        });
    } catch (error) {
        console.error('❌ Error applying promo code to cart:', error);
        res.status(500).json({
            message: "Failed to apply promo code",
            error: error.message
        });
    }
};

// Remove a promo code from a cart
exports.removePromoCode = async (req, res) => {
    console.log('🗑️ Remove promo code from cart request received');
    console.log('📦 Request body:', req.body);
    
    try {
        const { userId, cartId } = req.body;
        
        if (!userId || !cartId) {
            console.log('❌ Missing required fields');
            return res.status(400).json({ 
                message: "User ID and cart ID are required" 
            });
        }
        
        // Find the cart
        const Cart = require('../models/cart'); // Import Cart model
        const cart = await Cart.findById(cartId);
        
        if (!cart) {
            console.log(`❌ Cart not found: ${cartId}`);
            return res.status(404).json({ message: "Cart not found" });
        }
        
        // Check if cart belongs to the user
        if (cart.userId.toString() !== userId.toString()) {
            console.log(`❌ Cart does not belong to user: ${userId}`);
            return res.status(403).json({ message: "Not authorized to modify this cart" });
        }
        
        // Check if there's a promo code to remove
        if (!cart.promoCode) {
            console.log('❌ No promo code applied to this cart');
            return res.status(400).json({ message: "No promo code is applied to this cart" });
        }
        
        // Store the removed promo info for response
        const removedPromo = { ...cart.promoCode };
        
        // Remove promo code from cart
        cart.promoCode = undefined;
        
        // Save the updated cart
        await cart.save();
        
        console.log(`✅ Promo code removed from cart: ${removedPromo.code}`);
        
        // Calculate cart subtotal
        const cartSubtotal = cart.products.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);
        
        // Return updated cart info
        res.status(200).json({
            message: "Promo code removed successfully",
            removedPromo,
            cartTotal: {
                subtotal: cartSubtotal,
                discount: 0,
                total: cartSubtotal
            }
        });
    } catch (error) {
        console.error('❌ Error removing promo code from cart:', error);
        res.status(500).json({
            message: "Failed to remove promo code",
            error: error.message
        });
    }
};

console.log('✅ Promo Code controller initialized');