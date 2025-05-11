const Product = require('../models/product');
const mongoose = require('mongoose');


/**
 *  validate MongoDB ObjectID
 */
exports.validateObjectId = (req, res, next) => {
    const id = req.params.id || req.body.productId;
    if (id && !mongoose.Types.ObjectId.isValid(id)) {
        console.log(`❌ Invalid ObjectID format: ${id}`);
        return res.status(400).json({ message: "Invalid ID format" });
    }
    next();
};
// Create a new product
exports.createProduct = async (req, res) => {
    console.log('📥 Create product request received');
    console.log('📦 Request body:', req.body);
    
    const newProduct = new Product(req.body);
    
    // Explicitly handle the model3d field
    if (req.body.model3d) {
        newProduct.model3d = req.body.model3d;
        newProduct.markModified('model3d');
    }

    try {
        console.log('💾 Saving new product to database...');
        const savedProduct = await newProduct.save();
        console.log('✅ Product created successfully:', savedProduct._id);
        res.status(201).json(savedProduct);
    } catch (error) {
        console.error('❌ Error creating product:', error);
        res.status(500).json({ message: "Failed to create product", error: error.message });
    }
};

exports.updateProduct = async (req, res) => {
    console.log(`📝 Update product ${req.params.id} request received`);
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
    console.log('📋 Update fields:', Object.keys(req.body).join(', '));
    
    try {
        // First update the product in the database
        console.log('🔄 Starting product database update...');
        console.log('🔍 Looking for product with ID:', req.params.id);
        
        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        );
        
        console.log('🔄 Database update query completed');
        
        if (!updatedProduct) {
            console.log(`❌ Product not found in database with ID: ${req.params.id}`);
            return res.status(404).json({ message: "Product not found" });
        }
        
        console.log('✅ Product found and updated in database:', updatedProduct._id);
        console.log('📦 Updated product data:', JSON.stringify(updatedProduct, null, 2));
        
        // Sync carts with all applicable field changes from the product
        // Don't limit to just price and stock status
        try {
            console.log('🛒 Starting cart synchronization process...');
            console.log('🔄 Importing Cart model...');
            const Cart = require('../models/cart');
            console.log('✅ Cart model imported successfully');
            
            console.log('🔍 Building query to find carts with product:', req.params.id);
            const cartQuery = { 
                'products': { 
                    $elemMatch: { 
                        'productId': { $regex: req.params.id, $options: 'i' } 
                    } 
                } 
            };
            console.log('📋 Cart query:', JSON.stringify(cartQuery, null, 2));
            
            console.log('🔍 Executing cart search query...');
            const allCarts = await Cart.find(cartQuery);
            
            console.log(`🔍 Cart search complete. Found ${allCarts.length} carts containing this product`);
            if (allCarts.length === 0) {
                console.log('ℹ️ No carts found containing this product. Nothing to update.');
            }
            
            // Process each cart individually
            let totalUpdated = 0;
            console.log('🔄 Beginning to process each cart...');
            
            for (let cartIndex = 0; cartIndex < allCarts.length; cartIndex++) {
                const cart = allCarts[cartIndex];
                console.log(`🛒 Processing cart #${cartIndex + 1}/${allCarts.length} with ID: ${cart._id}`);
                console.log(`📋 Cart has ${cart.products.length} products`);
                
                let modified = false;
                console.log('🔍 Searching for matching products in cart...');
                
                // Update each product in the cart that matches the ID
                for (let i = 0; i < cart.products.length; i++) {
                    const product = cart.products[i];
                    
                    console.log(`👀 Examining cart product at index ${i}:`, product.productId);
                    console.log(`🔍 Comparing: ${product.productId.toString()} vs ${req.params.id.toString()}`);
                    
                    if (product.productId.toString() === req.params.id.toString()) {
                        console.log(`✅ Found matching product in cart at index ${i}`);
                        
                        // Define fields that can be updated in cart items
                        const updatableFields = [
                            'price', 'inStock', 'title', 'img', 'color', 'size', 'desc'
                        ];
                        
                        // Update all applicable fields from the request body
                        for (const field of updatableFields) {
                            if (req.body[field] !== undefined) {
                                console.log(`📝 Updating ${field} from "${product[field]}" to "${req.body[field]}"`);
                                product[field] = req.body[field];
                                modified = true;
                            }
                        }
                        
                        // Special handling for quantity affecting inStock
                        if (req.body.quantity !== undefined) {
                            const newInStock = req.body.quantity > 0;
                            if (product.inStock !== newInStock) {
                                console.log(`📦 Updating inStock based on quantity: ${product.inStock} → ${newInStock}`);
                                product.inStock = newInStock;
                                modified = true;
                            }
                        }
                    } else {
                        console.log(`❌ Product at index ${i} does not match target ID`);
                    }
                }
                
                // Save the cart if modified
                if (modified) {
                    console.log(`💾 Cart ${cart._id} was modified, saving changes...`);
                    try {
                        await cart.save();
                        console.log(`✅ Cart ${cart._id} saved successfully`);
                        totalUpdated++;
                    } catch (saveError) {
                        console.error(`❌ Error saving cart ${cart._id}:`, saveError);
                        console.error('Stack trace:', saveError.stack);
                    }
                } else {
                    console.log(`ℹ️ No changes made to cart ${cart._id}, skipping save`);
                }
            }
            
            console.log(`🛒 Cart processing complete. Updated ${totalUpdated} out of ${allCarts.length} carts`);
        } catch (cartError) {
            console.error('❌ Error during cart synchronization:', cartError);
            console.error('Full error details:', cartError);
            console.error('Stack trace:', cartError.stack);
            console.log('⚠️ Continuing with product update despite cart sync error');
        }
        
        console.log('✅ Product update process completed successfully');
        console.log('🔄 Sending response to client...');
        res.status(200).json(updatedProduct);
        console.log('✅ Response sent');
    } catch (error) {
        console.error('❌ Fatal error in updateProduct function:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ 
            message: "Failed to update product", 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};
// Delete a product
exports.deleteProduct = async (req, res) => {
    console.log(`🗑️ Delete product ${req.params.id} request received`);
    
    try {
        // First remove from all carts
        try {
            console.log('🛒 Removing product from all carts...');
            const Cart = require('../models/cart');
            
            // First, try to find a sample cart with this product to understand format
            const sampleCart = await Cart.findOne({
                'products.productId': req.params.id
            });
            
            console.log(`🔍 Sample cart with product: ${sampleCart ? 'Found ✅' : 'Not found ❌'}`);
            
            // Try both string and ObjectId comparison to be safe
            const updateResult = await Cart.updateMany(
                {},
                { 
                    $pull: { 
                        products: { 
                            productId: req.params.id // String comparison only
                        }
                    } 
                }
            );
            
            console.log(`🛒 Removed product from ${updateResult.modifiedCount} carts`);
            
            // If the first method didn't work, try a more direct approach
            if (updateResult.modifiedCount === 0) {
                console.log('🔄 First approach didn\'t find any carts, trying alternative...');
                
                // Find all carts that might contain this product
                const allCarts = await Cart.find({ 
                    'products': { 
                        $elemMatch: { 
                            'productId': { $regex: req.params.id, $options: 'i' } 
                        } 
                    } 
                });
                
                console.log(`🔍 Found ${allCarts.length} carts potentially containing this product`);
                
                // Process each cart individually
                let totalUpdated = 0;
                for (const cart of allCarts) {
                    // Filter out the product we want to remove
                    const originalLength = cart.products.length;
                    cart.products = cart.products.filter(product => 
                        product.productId.toString() !== req.params.id.toString()
                    );
                    
                    // If products were removed, save the cart
                    if (cart.products.length < originalLength) {
                        await cart.save();
                        totalUpdated++;
                    }
                }
                
                console.log(`🛒 Manually updated ${totalUpdated} carts`);
            }
        } catch (cartError) {
            console.error('❌ Error removing product from carts:', cartError);
        }
        
        console.log('🔄 Deleting product from database...');
        const deletedProduct = await Product.findByIdAndDelete(req.params.id);
        
        if (!deletedProduct) {
            console.log(`❌ Product not found: ${req.params.id}`);
            return res.status(404).json({ message: "Product not found" });
        }
        
        console.log('✅ Product deleted successfully:', req.params.id);
        return res.status(200).json({ message: "Product has been deleted successfully" });
    } catch (error) {
        console.error('❌ Error deleting product:', error);
        return res.status(500).json({ message: "Failed to delete product", error: error.message });
    }
};

// Get product by ID
exports.getProductById = async (req, res) => {
    console.log(`🔍 Find product by ID ${req.params.id} request received`);
    const userId = req.query.userId;
    
    if (userId) {
        console.log(`👤 Request includes user context: ${userId}`);
    }
    
    try {
        console.log('🔄 Retrieving product from database...');
        const product = await Product.findById(req.params.id);
        
        if (!product) {
            console.log(`❌ Product not found: ${req.params.id}`);
            return res.status(404).json({ message: "Product not found" });
        }
        
        console.log('✅ Product found:', product._id);
        
        // If userId is provided, check favorite and saved-for-later status
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            const productObj = product.toObject();
            
            // Check if user has favorited this product
            const isFavorite = product.favoritedBy && 
                product.favoritedBy.some(item => item.userId.toString() === userId);
            
            // Check if user has saved this product for later
            const isSavedForLater = product.savedForLaterBy && 
                product.savedForLaterBy.some(item => item.userId.toString() === userId);
            
            // Add user-specific flags
            productObj.isFavorite = !!isFavorite;
            productObj.isSavedForLater = !!isSavedForLater;
            
            console.log(`👤 User context added - Favorite: ${!!isFavorite}, Saved For Later: ${!!isSavedForLater}`);
            return res.status(200).json(productObj);
        }
        
        // Return product without user context
        return res.status(200).json(product);
    } catch (error) {
        console.error('❌ Error finding product:', error);
        return res.status(500).json({ message: "Failed to retrieve product", error: error.message });
    }
};

// Get all products with filtering, sorting, and pagination
exports.getAllProducts = async (req, res) => {
    console.log('🔍 Find products request received');
    console.log('🔍 Query parameters:', req.query);
    
    const {
        new: qNew, 
        category: qCategory, 
        sort, 
        page = 1, 
        limit = 300,
        userId
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const hasUserContext = userId && mongoose.Types.ObjectId.isValid(userId);
    
    try {
        let query = {};
        let sortOptions = {};
        
        // Build query based on filters
        if (qCategory) {
            query.categories = { $in: [qCategory] };
            console.log(`🔍 Filtering by category: ${qCategory}`);
        }
        
        // Build sort options
        if (sort) {
            switch(sort) {
                case 'newest':
                    sortOptions.createdAt = -1;
                    break;
                case 'oldest':
                    sortOptions.createdAt = 1;
                    break;
                case 'price-asc':
                    sortOptions.price = 1;
                    break;
                case 'price-desc':
                    sortOptions.price = -1;
                    break;
                case 'popular':
                    sortOptions.favoriteCount = -1;
                    break;
                default:
                    sortOptions.createdAt = -1;
            }
            console.log(`🔍 Sorting by: ${sort}`);
        } else {
            sortOptions.createdAt = -1; // Default sort
        }
        
        console.log('🔄 Retrieving products from database...');
        
        // Handle the "new" query parameter
        if (qNew === 'true') {
            console.log('🔍 Finding newest products');
            const products = await Product.find()
                .sort({ createdAt: -1 })
                .limit(parseInt(limit));
                
            return res.status(200).json(products);
        }
        
        // Regular query with pagination
        const products = await Product.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit));
            
        // Count total for pagination
        const total = await Product.countDocuments(query);
        
        console.log(`✅ Found ${products.length} products (total: ${total})`);
        
        // If userId is provided, add user context to each product
        if (hasUserContext) {
            console.log(`👤 Adding user context for: ${userId}`);
            const productsWithUserContext = products.map(product => {
                const productObj = product.toObject();
                
                productObj.isFavorite = product.favoritedBy && 
                    product.favoritedBy.some(item => item.userId.toString() === userId);
                    
                productObj.isSavedForLater = product.savedForLaterBy && 
                    product.savedForLaterBy.some(item => item.userId.toString() === userId);
                    
                return productObj;
            });
            
            return res.status(200).json({
                products: productsWithUserContext,
                totalPages: Math.ceil(total / parseInt(limit)),
                currentPage: parseInt(page),
                totalProducts: total
            });
        }
        
        // Return products without user context
        res.status(200).json({
            products,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            totalProducts: total
        });
    } catch (error) {
        console.error('❌ Error finding products:', error);
        res.status(500).json({ message: "Failed to retrieve products", error: error.message });
    }
};

// Toggle favorite status for a product
exports.toggleFavorite = async (req, res) => {
    console.log('❤️ Toggle favorite status request received');
    console.log('📦 Request body:', req.body);
    
    try {
        const { userId, productId } = req.body;
        
        // Validate required fields
        if (!userId || !productId) {
            console.log('❌ Missing required fields');
            return res.status(400).json({ message: "Both userId and productId are required" });
        }
        
        // Validate ID formats
        if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(productId)) {
            console.log('❌ Invalid ID format');
            return res.status(400).json({ message: "Invalid ID format" });
        }
        
        // Find the product
        console.log(`🔄 Finding product: ${productId}`);
        const product = await Product.findById(productId);
        
        if (!product) {
            console.log(`❌ Product not found: ${productId}`);
            return res.status(404).json({ message: "Product not found" });
        }
        
        // Initialize favoritedBy array if it doesn't exist
        if (!product.favoritedBy) {
            product.favoritedBy = [];
        }
        
        // Check if user already favorited this product
        const favoriteIndex = product.favoritedBy.findIndex(
            item => item.userId && item.userId.toString() === userId
        );
        
        if (favoriteIndex > -1) {
            // User already favorited this product, so unfavorite it
            console.log(`💔 Removing favorite: User ${userId} unfavorited product ${productId}`);
            product.favoritedBy.splice(favoriteIndex, 1);
            await product.save();
            
            return res.status(200).json({ 
                isFavorite: false,
                favoriteCount: product.favoritedBy.length,
                message: "Product removed from favorites" 
            });
        } else {
            // Add as favorite
            console.log(`❤️ Adding favorite: User ${userId} favorited product ${productId}`);
            product.favoritedBy.push({
                userId: new mongoose.Types.ObjectId(userId),
                addedAt: new Date()
            });
            
            // Update the favoriteCount field
            product.favoriteCount = product.favoritedBy.length;
            
            await product.save();
            
            return res.status(200).json({ 
                isFavorite: true,
                favoriteCount: product.favoritedBy.length,
                message: "Product added to favorites" 
            });
        }
    } catch (error) {
        console.error('❌ Error toggling favorite status:', error);
        res.status(500).json({
            message: "Failed to toggle favorite status",
            error: error.message
        });
    }
};

// Toggle saved for later status for a product
// Toggle saved for later status for a product
exports.toggleSavedForLater = async (req, res) => {
    console.log('🔖 Toggle saved for later status request received');
    console.log('📦 Request body:', req.body);
    
    try {
        const { userId, productId, fromCart = false } = req.body;
        
        // Validate required fields
        if (!userId || !productId) {
            console.log('❌ Missing required fields');
            return res.status(400).json({ message: "Both userId and productId are required" });
        }
        
        // Validate ID formats
        if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(productId)) {
            console.log('❌ Invalid ID format');
            return res.status(400).json({ message: "Invalid ID format" });
        }
        
        // Find the product
        console.log(`🔄 Finding product: ${productId}`);
        const product = await Product.findById(productId);
        
        if (!product) {
            console.log(`❌ Product not found: ${productId}`);
            return res.status(404).json({ message: "Product not found" });
        }
        
        // Initialize savedForLaterBy array if it doesn't exist
        if (!product.savedForLaterBy) {
            product.savedForLaterBy = [];
        }
        
        // Check if user already saved this product for later
        const savedIndex = product.savedForLaterBy.findIndex(
            item => item.userId && item.userId.toString() === userId
        );
        
        // IMPORTANT: If adding to saved items, check if in cart and remove it
        if (savedIndex === -1 && fromCart) {
            try {
                console.log(`🛒 Removing product ${productId} from user's cart...`);
                const Cart = require('../models/cart');
                
                // Find user's cart
                const userCart = await Cart.findOne({ userId: userId });
                
                if (userCart) {
                    // Remove the product from cart
                    const originalLength = userCart.products.length;
                    userCart.products = userCart.products.filter(
                        item => item.productId.toString() !== productId.toString()
                    );
                    
                    if (userCart.products.length < originalLength) {
                        await userCart.save();
                        console.log(`✅ Product removed from cart successfully`);
                    } else {
                        console.log(`⚠️ Product not found in cart`);
                    }
                } else {
                    console.log(`⚠️ User cart not found`);
                }
            } catch (cartError) {
                console.error(`❌ Error removing product from cart:`, cartError);
            }
        }
        
        if (savedIndex > -1) {
            // User already saved this product, so remove it
            console.log(`🔖 Removing saved for later: User ${userId} removed product ${productId}`);
            product.savedForLaterBy.splice(savedIndex, 1);
            
            // Update the savedForLaterCount field
            product.savedForLaterCount = product.savedForLaterBy.length;
            
            await product.save();
            
            return res.status(200).json({ 
                isSavedForLater: false,
                savedForLaterCount: product.savedForLaterBy.length,
                message: "Product removed from saved items" 
            });
        } else {
            // Add to saved for later
            console.log(`🔖 Adding to saved for later: User ${userId} saved product ${productId}`);
            product.savedForLaterBy.push({
                userId: new mongoose.Types.ObjectId(userId),
                savedAt: new Date(),
                fromCart: fromCart
            });
            
            // Update the savedForLaterCount field
            product.savedForLaterCount = product.savedForLaterBy.length;
            
            await product.save();
            
            return res.status(200).json({ 
                isSavedForLater: true,
                savedForLaterCount: product.savedForLaterBy.length,
                message: "Product saved for later" 
            });
        }
    } catch (error) {
        console.error('❌ Error toggling saved for later status:', error);
        res.status(500).json({
            message: "Failed to toggle saved for later status",
            error: error.message
        });
    }
};

// Get a user's favorite products
exports.getUserFavorites = async (req, res) => {
    console.log(`❤️ Get user's favorite products request received for user ${req.params.userId}`);
    
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    try {
        const userId = req.params.userId;
        
        // Validate userId format
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            console.log(`❌ Invalid user ID format: ${userId}`);
            return res.status(400).json({ message: "Invalid user ID format" });
        }
        
        console.log(`🔄 Finding favorite products for user: ${userId}`);
        
        // Find products where the user is in favoritedBy array
        const favoriteProducts = await Product.find({
            'favoritedBy.userId': new mongoose.Types.ObjectId(userId)
        })
        .select("title desc img categories size color price inStock quantity favoritedBy")
        .sort({ 'favoritedBy.addedAt': -1 })
        .skip(skip)
        .limit(parseInt(limit));
        
        // Count total favorites for pagination
        const total = await Product.countDocuments({
            'favoritedBy.userId': new mongoose.Types.ObjectId(userId)
        });
        
        console.log(`✅ Found ${favoriteProducts.length} favorite products for user ${userId}`);
        
        // Add isFavorite flag to each product (always true for this endpoint)
        const enhancedProducts = favoriteProducts.map(product => {
            const productObj = product.toObject();
            productObj.isFavorite = true;
            
            // Check if also saved for later
            productObj.isSavedForLater = product.savedForLaterBy && 
                product.savedForLaterBy.some(item => item.userId && item.userId.toString() === userId);
                
            return productObj;
        });
        
        res.status(200).json({
            products: enhancedProducts,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            totalProducts: total
        });
    } catch (error) {
        console.error('❌ Error fetching favorite products:', error);
        res.status(500).json({
            message: "Failed to fetch favorite products",
            error: error.message
        });
    }
};

// Get a user's saved for later products
exports.getUserSavedProducts = async (req, res) => {
    console.log(`🔖 Get user's saved for later products request received for user ${req.params.userId}`);
    
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    try {
        const userId = req.params.userId;
        
        // Validate userId format
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            console.log(`❌ Invalid user ID format: ${userId}`);
            return res.status(400).json({ message: "Invalid user ID format" });
        }
        
        console.log(`🔄 Finding saved for later products for user: ${userId}`);
        
        // Find products where the user is in savedForLaterBy array
        const savedProducts = await Product.find({
            'savedForLaterBy.userId': new mongoose.Types.ObjectId(userId)
        })
        .sort({ 'savedForLaterBy.savedAt': -1 })
        .skip(skip)
        .limit(parseInt(limit));
        
        // Count total saved items for pagination
        const total = await Product.countDocuments({
            'savedForLaterBy.userId': new mongoose.Types.ObjectId(userId)
        });
        
        console.log(`✅ Found ${savedProducts.length} saved for later products for user ${userId}`);
        
        // Add isSavedForLater flag to each product (always true for this endpoint)
        const enhancedProducts = savedProducts.map(product => {
            const productObj = product.toObject();
            productObj.isSavedForLater = true;
            
            // Check if also favorited
            productObj.isFavorite = product.favoritedBy && 
                product.favoritedBy.some(item => item.userId && item.userId.toString() === userId);
                
            // Find the savedForLater entry for this user to get fromCart flag
            const savedForLaterEntry = product.savedForLaterBy.find(
                item => item.userId && item.userId.toString() === userId
            );
            
            productObj.fromCart = savedForLaterEntry ? savedForLaterEntry.fromCart : false;
            productObj.savedAt = savedForLaterEntry ? savedForLaterEntry.savedAt : null;
            
            return productObj;
        });
        
        res.status(200).json({
            products: enhancedProducts,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            totalProducts: total
        });
    } catch (error) {
        console.error('❌ Error fetching saved for later products:', error);
        res.status(500).json({
            message: "Failed to fetch saved for later products",
            error: error.message
        });
    }
};

// Move a product from cart to saved items
exports.moveToSaved = async (req, res) => {
    console.log('🔄 Move product from cart to saved for later');
    console.log('📦 Request body:', req.body);
    
    try {
        const { userId, productId, cartId } = req.body;
        
        // Validate required fields
        if (!userId || !productId) {
            console.log('❌ Missing required fields');
            return res.status(400).json({ message: "userId and productId are required" });
        }
        
        const product = await Product.findById(productId);
        
        if (!product) {
            console.log(`❌ Product not found: ${productId}`);
            return res.status(404).json({ message: "Product not found" });
        }
        
        // Initialize savedForLaterBy array if it doesn't exist
        if (!product.savedForLaterBy) {
            product.savedForLaterBy = [];
        }
        
        // Check if already saved
        const savedIndex = product.savedForLaterBy.findIndex(
            item => item.userId && item.userId.toString() === userId
        );
        
        // Only add to saved if not already there
        if (savedIndex === -1) {
            // Add to saved for later
            console.log(`🔖 Adding to saved for later: User ${userId} saved product ${productId} from cart`);
            product.savedForLaterBy.push({
                userId: new mongoose.Types.ObjectId(userId),
                savedAt: new Date(),
                fromCart: true
            });
            
            product.savedForLaterCount = product.savedForLaterBy.length;
            await product.save();
            console.log(`✅ Product saved for later successfully`);
        } else {
            console.log(`⚠️ Product already saved for later`);
        }
        
        // Remove the item from the cart
        let removedFromCart = false;
        try {
            console.log(`🛒 Removing product ${productId} from cart...`);
            const Cart = require('../models/cart');
            
            // Try to find the cart, first by ID if provided
            let cart = null;
            if (cartId) {
                cart = await Cart.findById(cartId);
            }
            
            // If not found by ID, try by userId
            if (!cart) {
                cart = await Cart.findOne({ userId: userId });
            }
            
            if (cart) {
                // Remove the product from cart
                const originalLength = cart.products.length;
                cart.products = cart.products.filter(
                    item => item.productId.toString() !== productId.toString()
                );
                
                if (cart.products.length < originalLength) {
                    await cart.save();
                    console.log(`✅ Product removed from cart successfully`);
                    removedFromCart = true;
                } else {
                    console.log(`⚠️ Product not found in cart`);
                }
            } else {
                console.log(`⚠️ Cart not found`);
            }
        } catch (cartError) {
            console.error('❌ Error removing product from cart:', cartError);
        }
        
        console.log('✅ Move to saved for later process completed');
        
        res.status(200).json({
            message: "Product " + (savedIndex === -1 ? "moved to" : "already in") + " saved for later",
            isSavedForLater: true,
            removedFromCart: removedFromCart
        });
        
    } catch (error) {
        console.error('❌ Error moving product to saved for later:', error);
        res.status(500).json({
            message: "Failed to move product to saved for later",
            error: error.message
        });
    }
};

/**
 * Unified function to recommend products based on furniture items

 */
exports.getProductRecommendations = async (req, res) => {
    console.log('🪑 Get product recommendations request received');
    
    try {
        let furnitureItems = [];
        let budgetRange = null;
        
        // Handle both GET and POST requests with different input formats
        if (req.method === 'GET') {
            console.log('🔍 Query parameters:', req.query);
            const { categories, limit = 8, minPrice, maxPrice } = req.query;
            
            if (!categories) {
                return res.status(400).json({
                    success: false,
                    message: 'At least one furniture category is required'
                });
            }
            
            // Handle both array and comma-separated string formats
            furnitureItems = Array.isArray(categories)
                ? categories.map(c => c.toLowerCase())
                : categories.split(',').map(c => c.toLowerCase());
                
            // Parse budget parameters if provided
            if (minPrice !== undefined || maxPrice !== undefined) {
                budgetRange = {};
                if (minPrice !== undefined) budgetRange.min = parseFloat(minPrice);
                if (maxPrice !== undefined) budgetRange.max = parseFloat(maxPrice);
                console.log('💰 Budget range:', budgetRange);
            }
                
        } else {  // POST
            console.log('📦 Request body:', req.body);
            const { furniture, items, budget, minPrice, maxPrice } = req.body;
            
            // Handle both detailed furniture objects and simple item lists
            if (furniture && Array.isArray(furniture)) {
                furnitureItems = furniture.map(item => item.type.toLowerCase());
            } else if (items && Array.isArray(items)) {
                furnitureItems = items.map(item => typeof item === 'string' ? item.toLowerCase() : item.type.toLowerCase());
            } else if (req.body.categories) {
                // Fallback to categories field
                furnitureItems = Array.isArray(req.body.categories) 
                    ? req.body.categories.map(c => c.toLowerCase())
                    : req.body.categories.split(',').map(c => c.toLowerCase());
            }
            
            // Parse budget parameters
            if (budget || minPrice !== undefined || maxPrice !== undefined) {
                budgetRange = {};
                
                // Handle single budget value or object with min/max
                if (budget !== undefined) {
                    if (typeof budget === 'object') {
                        if (budget.min !== undefined) budgetRange.min = parseFloat(budget.min);
                        if (budget.max !== undefined) budgetRange.max = parseFloat(budget.max);
                    } else {
                        // Treat as maximum budget
                        budgetRange.max = parseFloat(budget);
                    }
                }
                
                // These take precedence over budget object if both provided
                if (minPrice !== undefined) budgetRange.min = parseFloat(minPrice);
                if (maxPrice !== undefined) budgetRange.max = parseFloat(maxPrice);
                
                console.log('💰 Budget range:', budgetRange);
            }
        }
        
        // Validate we have items to work with
        if (furnitureItems.length === 0) {
            console.log('❌ No furniture items provided');
            return res.status(400).json({
                success: false,
                message: 'At least one furniture item is required'
            });
        }
        
        console.log(`🔍 Finding products for furniture types:`, furnitureItems);
        
        // Create a mapping between furniture types and product categories
        const categoryMapping = {
            'bed': ['beds', 'bedroom', 'mattress'],
            'desk': ['desk', 'office', 'workspace'],
            'chair': ['chairs', 'seating'],
            'sofa': ['sofas', 'couches', 'seating'],
            'table': ['tables', 'dining'],
            'dresser': ['storage', 'bedroom'],
            'tv': ['entertainment', 'electronics'],
            'lamp': ['lighting', 'lamps'],
            'nightstand': ['bedroom', 'tables'],
            'rug': ['rugs', 'flooring', 'decor'],
            'door': ['doors', 'hardware'],
            'window': ['windows', 'curtains', 'blinds']
        };
        
        // Complementary product mapping
        const complementaryMap = {
            'sofa': ['coffee-table', 'rug', 'side-table', 'lamp'],
            'bed': ['nightstand', 'dresser', 'bedding', 'lamp'],
            'dining-table': ['dining-chair', 'sideboard', 'rug'],
            'desk': ['office-chair', 'bookshelf', 'desk-lamp'],
            'tv': ['tv-stand', 'speakers', 'media-console']
        };
        
        // Count occurrences for weighting
        const typeCounts = {};
        furnitureItems.forEach(type => {
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        });
        
        // Define recommendations object structure
        const recommendations = {
            primaryProducts: [],     // products matching user's requested items
            complementaryProducts: [], // products that complement the user's items
            byCategory: {},          // products organized by furniture type
            budgetFriendly: []       // budget-optimized products
        };
        
        const limit = parseInt(req.query.limit || req.body.limit || 8);
        
        // Process each unique furniture type
        const uniqueFurnitureTypes = [...new Set(furnitureItems)];
        for (const furnitureType of uniqueFurnitureTypes) {
            // Normalize the type
            const normalizedType = furnitureType.toLowerCase().replace(/-/g, ' ');
            
            // Get mapped product categories
            const mappedCategories = categoryMapping[normalizedType] || [normalizedType];
            
            console.log(`🔍 Searching for "${furnitureType}" products using categories:`, mappedCategories);
            
            // Build query for this furniture type
            let query = {
                $or: [
                    { categories: { $in: mappedCategories } },
                    { title: { $regex: normalizedType, $options: 'i' } },
                    { tags: { $in: [normalizedType] } }
                ]
            };
            
            // Add budget constraints if provided
            if (budgetRange) {
                query.price = {};
                if (budgetRange.min !== undefined) query.price.$gte = budgetRange.min;
                if (budgetRange.max !== undefined) query.price.$lte = budgetRange.max;
            }
            
            // Find primary products for this furniture type
            const primaryProducts = await Product.find(query)
                .sort({ rating: -1 })
                .limit(limit);
            
            console.log(`✅ Found ${primaryProducts.length} primary products for "${furnitureType}"`);
            
            // Store by category
            recommendations.byCategory[furnitureType] = primaryProducts;
            
            // Add to combined primary products
            recommendations.primaryProducts = [
                ...recommendations.primaryProducts,
                ...primaryProducts
            ];
            
            // Find complementary products
            // First normalize the furniture type to match the complementary map
            let complementaryTypes = [];
            for (const [key, values] of Object.entries(complementaryMap)) {
                if (normalizedType.includes(key) || key.includes(normalizedType)) {
                    complementaryTypes = values;
                    break;
                }
            }
            
            if (complementaryTypes.length > 0) {
                // Filter out complementary types that are already in the user's request
                const newComplementaryTypes = complementaryTypes.filter(
                    type => !uniqueFurnitureTypes.some(
                        existingType => existingType.toLowerCase().includes(type) || 
                        type.includes(existingType.toLowerCase())
                    )
                );
                
                if (newComplementaryTypes.length > 0) {
                    // Map complementary types to product categories
                    const complementaryCategoriesMapped = newComplementaryTypes.flatMap(type => {
                        const normalized = type.toLowerCase().replace(/-/g, ' ');
                        return categoryMapping[normalized] || [normalized];
                    });
                    
                    // Build complementary query with budget constraints
                    let complementaryQuery = {
                        $or: [
                            { categories: { $in: complementaryCategoriesMapped } },
                            { title: { $regex: new RegExp(newComplementaryTypes.join('|'), 'i') } },
                            { tags: { $in: newComplementaryTypes } }
                        ]
                    };
                    
                    // Add budget constraints if provided
                    if (budgetRange) {
                        complementaryQuery.price = {};
                        if (budgetRange.min !== undefined) complementaryQuery.price.$gte = budgetRange.min;
                        if (budgetRange.max !== undefined) complementaryQuery.price.$lte = budgetRange.max;
                    }
                    
                    const complementaryProducts = await Product.find(complementaryQuery)
                        .sort({ rating: -1 })
                        .limit(Math.ceil(limit / 2));
                    
                    // Add to overall complementary products
                    recommendations.complementaryProducts = [
                        ...recommendations.complementaryProducts,
                        ...complementaryProducts
                    ];
                }
            }
        }
        
        // Remove duplicates from recommendation lists and sort by rating
        recommendations.primaryProducts = Array.from(
            new Map(recommendations.primaryProducts.map(item => [item._id.toString(), item]))
            .values()
        ).sort((a, b) => (b.rating || 0) - (a.rating || 0));
        
        recommendations.complementaryProducts = Array.from(
            new Map(recommendations.complementaryProducts.map(item => [item._id.toString(), item]))
            .values()
        ).sort((a, b) => (b.rating || 0) - (a.rating || 0));
        
        // Create budget-optimized list if budget range provided
        if (budgetRange) {
            // Combine all products 
            const allProducts = [...recommendations.primaryProducts];
            
            // Sort by best value (using rating/price ratio)
            recommendations.budgetFriendly = allProducts
                .filter(product => product.price > 0) // Avoid division by zero
                .sort((a, b) => {
                    const ratingA = a.rating || 3; // Default rating if not available
                    const ratingB = b.rating || 3;
                    return (ratingB / b.price) - (ratingA / a.price); // Higher value first
                })
                .slice(0, limit);
                
            console.log(`💰 Selected ${recommendations.budgetFriendly.length} budget-friendly recommendations`);
        }
        
        // Limit results to avoid overwhelming responses
        recommendations.primaryProducts = recommendations.primaryProducts.slice(0, limit * 2);
        recommendations.complementaryProducts = recommendations.complementaryProducts.slice(0, limit);
        
        console.log(`✅ Total recommendations - Primary: ${recommendations.primaryProducts.length}, Complementary: ${recommendations.complementaryProducts.length}, Budget-friendly: ${recommendations.budgetFriendly?.length || 0}`);
        
        // If budget was specified, include total costs in response
        let budgetAnalysis = null;
        if (budgetRange) {
            // Calculate minimum cost to furnish with all primary categories
            const minCostByCategory = {};
            let totalMinCost = 0;
            
            for (const [category, products] of Object.entries(recommendations.byCategory)) {
                if (products.length > 0) {
                    // Find cheapest product in each category
                    const cheapest = products.reduce((min, product) => 
                        (product.price < min.price) ? product : min, products[0]);
                    
                    minCostByCategory[category] = cheapest.price;
                    totalMinCost += cheapest.price;
                }
            }
            
            budgetAnalysis = {
                minCostByCategory,
                totalMinCost,
                budgetRange,
                withinBudget: budgetRange.max ? totalMinCost <= budgetRange.max : true
            };
        }
        
        return res.status(200).json({
            success: true,
            furnitureItems: uniqueFurnitureTypes,
            recommendations,
            budgetAnalysis
        });
        
    } catch (error) {
        console.error('❌ Error getting product recommendations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get product recommendations',
            error: error.message
        });
    }
};



/**
 * Enhanced product differentiation and technical details for comparison
 * This function updates the existing compareProducts controller with better product-specific analysis
 */
exports.compareProducts = async (req, res) => {
    console.log('🔄 Product comparison request received');
    console.log('📦 Request body:', req.body);
    
    try {
        const { productIds, userId } = req.body;
        
        // Validate input
        if (!productIds || !Array.isArray(productIds) || productIds.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Please provide at least 2 product IDs to compare'
            });
        }
        
        // Fetch products without trying to populate reviews
        const products = await Product.find({ _id: { $in: productIds } });
        
        if (products.length === 0 || products.length < productIds.length) {
            return res.status(404).json({
                success: false,
                message: 'One or more products could not be found'
            });
        }
        
        console.log(`✅ Successfully retrieved ${products.length} products for comparison`);
        
        // Initialize the comparison structure
        const comparison = {
            basic: {}, 
            price: {},
            appearance: {},
            technicalDetails: {},
            function: {},
            compatibility: {},
            maintenance: {}
        };
        
        // Get price stats
        const priceArray = products.map(p => p.price);
        const cheapestPrice = Math.min(...priceArray);
        const mostExpensivePrice = Math.max(...priceArray);
        
        // Utility function to extract type from product name
        const deriveProductType = (name) => {
            name = name.toLowerCase();
            const typeMap = {
                'bed': ['bed', 'mattress'],
                'table': ['table', 'desk'],
                'chair': ['chair'],
                'sofa': ['sofa', 'couch', 'sectional'],
                'lamp': ['lamp', 'light'],
                'storage': ['shelf', 'cabinet', 'dresser', 'nightstand'],
                'vase': ['vase'],
                'rug': ['rug', 'carpet', 'mat']
            };
            
            for (const [type, keywords] of Object.entries(typeMap)) {
                if (keywords.some(keyword => name.includes(keyword))) {
                    return type;
                }
            }
            return 'furniture';
        };
        
        // Utility function to extract size from product name
        const deriveSizeFromName = (name) => {
            name = name.toLowerCase();
            const sizeMap = {
                'Single/Twin': ['single', 'twin'],
                'Double': ['double', 'full'],
                'Queen': ['queen'],
                'King': ['king'],
                'Small': ['small', 'compact'],
                'Large': ['large', 'big']
            };
            
            for (const [size, keywords] of Object.entries(sizeMap)) {
                if (keywords.some(keyword => name.includes(keyword))) {
                    return size;
                }
            }
            return '';
        };
        
        // Extract product types and sizes from names
        products.forEach(product => {
            product.derivedType = deriveProductType(product.title);
            
            // Add size information based on name if not present in product
            if (!product.size) {
                product.derivedSize = deriveSizeFromName(product.title);
            }
        });
        
        // Utility function to derive material from product name
        const deriveMaterial = (name) => {
            name = name.toLowerCase();
            const materials = [
                { name: 'Wood', keywords: ['wood', 'wooden', 'oak', 'pine', 'maple', 'walnut'] },
                { name: 'Metal', keywords: ['metal', 'steel', 'iron', 'aluminum'] },
                { name: 'Glass', keywords: ['glass'] },
                { name: 'Fabric', keywords: ['fabric', 'cloth', 'textile', 'cotton', 'linen'] },
                { name: 'Leather', keywords: ['leather'] }
            ];
            
            for (const material of materials) {
                if (material.keywords.some(keyword => name.includes(keyword))) {
                    return material.name;
                }
            }
            return "";
        };
        
        // Process each product
        products.forEach(product => {
            const id = product._id.toString();
            const productType = product.derivedType;
            const name = product.title.toLowerCase();
            
            // Basic product info
            comparison.basic[id] = {
                id,
                title: product.title,
                price: product.price,
                img: product.img,
                thumbnails: product.img ? [product.img] : [],
                inStock: product.inStock,
                quantity: product.quantity,
                productTypes: product.categories || [productType.toUpperCase()]
            };
            
            // Price comparison with direct comparison
            const price = product.price;
            
            // Find the other product for direct comparison
            const otherProducts = products.filter(p => p._id.toString() !== id);
            const otherProduct = otherProducts.length > 0 ? otherProducts[0] : null;
            
            // Determine price position and create comparison text
            let pricePosition, priceInsight, directComparisonText;
            
            // Set price position and base insight
            if (price === cheapestPrice) {
                pricePosition = "cheapest";
                priceInsight = `Most affordable option at $${price.toFixed(2)}`;
            } else if (price === mostExpensivePrice) {
                pricePosition = "most expensive";
                priceInsight = `Premium option at $${price.toFixed(2)}`;
            } else {
                pricePosition = "mid-range";
                priceInsight = `Mid-range option at $${price.toFixed(2)}`;
            }
            
            // Add direct comparison text if we have another product to compare with
            if (otherProduct) {
                const priceDiff = Math.abs(price - otherProduct.price);
                const basePrice = Math.min(price, otherProduct.price);
                const percentDiff = Math.round((priceDiff / basePrice) * 100);
                
                if (price < otherProduct.price) {
                    directComparisonText = `$${priceDiff.toFixed(2)} (${percentDiff}%) cheaper than ${otherProduct.title}`;
                } else if (price > otherProduct.price) {
                    directComparisonText = `$${priceDiff.toFixed(2)} (${percentDiff}%) more expensive than ${otherProduct.title}`;
                } else {
                    directComparisonText = `Same price as ${otherProduct.title}`;
                }
            } else {
                directComparisonText = "";
            }
            
            comparison.price[id] = {
                price: price,
                formattedPrice: `$${price.toFixed(2)}`,
                position: pricePosition,
                insight: priceInsight,
                directComparison: directComparisonText
            };
            
            // Determine style from product name
            const getStyle = (name) => {
                const styles = [
                    { name: 'Modern', keywords: ['modern'] },
                    { name: 'Traditional', keywords: ['traditional', 'classic'] },
                    { name: 'Vintage', keywords: ['vintage', 'retro', 'antique'] },
                    { name: 'Rustic', keywords: ['rustic', 'farmhouse', 'country'] },
                    { name: 'Contemporary', keywords: ['contemporary', 'current'] },
                    { name: 'Industrial', keywords: ['industrial', 'urban'] },
                    { name: 'Minimalist', keywords: ['minimalist', 'minimal', 'simple'] }
                ];
                
                for (const style of styles) {
                    if (style.keywords.some(keyword => name.includes(keyword))) {
                        return style.name;
                    }
                }
                return 'Classic';
            };
            
            // Appearance info
            comparison.appearance[id] = {
                color: product.color || "",
                style: getStyle(name)
            };
            
            // Technical details
            comparison.technicalDetails[id] = {
                dimensions: product.dimensions || { unit: "cm" },
                size: product.size || product.derivedSize || "",
                material: deriveMaterial(name)
            };
            
            // Map product types to functions
            const functionMap = {
                'bed': 'Sleeping and resting',
                'table': 'Surface for activities and dining',
                'chair': 'Seating and comfort',
                'sofa': 'Relaxation and seating multiple people',
                'lamp': 'Illumination and ambiance',
                'storage': 'Organization and storing items',
                'vase': 'Displaying flowers and decorative element',
                'rug': 'Floor covering and room accent'
            };
            
            // Function based on product type
            comparison.function[id] = {
                primaryFunction: functionMap[productType] || 'Functional decor for your space',
                secondaryFunctions: [],
                uniqueCapabilities: []
            };
            
            // Add secondary functions based on product type and keywords
            const secondaryFunctions = {
                'bed': {
                    'storage': 'Storage underneath',
                    'adjustable': 'Adjustable positions',
                    'foldable': 'Space-saving foldable design'
                },
                'sofa': {
                    'sleeper': 'Converts to bed',
                    'recliner': 'Reclining function',
                    'sectional': 'Modular arrangement options'
                },
                'chair': {
                    'swivel': 'Rotates 360 degrees',
                    'recliner': 'Reclining function',
                    'folding': 'Collapsible for storage'
                },
                'table': {
                    'extendable': 'Extends for more surface area',
                    'folding': 'Folds for storage',
                    'adjustable': 'Height adjustment'
                }
            };
            
            // Add relevant secondary functions
            if (secondaryFunctions[productType]) {
                for (const [keyword, description] of Object.entries(secondaryFunctions[productType])) {
                    if (name.includes(keyword)) {
                        comparison.function[id].secondaryFunctions.push(description);
                    }
                }
            }
            
            // Compatibility suggestions based on product type
            const compatibilityMap = {
                'bed': ['Nightstand', 'Dresser', 'Bedside Lamp', 'Rug'],
                'sofa': ['Coffee Table', 'Side Table', 'Area Rug', 'Floor Lamp'],
                'chair': ['Side Table', 'Floor Lamp', 'Ottoman'],
                'table': ['Chair', 'Rug', 'Pendant Light'],
                'lamp': ['Side Table', 'Desk', 'Console Table'],
                'storage': ['Decorative Boxes', 'Bookends', 'Wall Art'],
                'rug': ['Coffee Table', 'Sofa', 'Chairs']
            };
            
            comparison.compatibility[id] = {
                pairsWellWith: compatibilityMap[productType] || [],
                complementaryProducts: [],
                roomStyles: ['Eclectic', 'Contemporary', 'Modern', productType === 'bed' ? 'Cozy' : 'Minimalist']
            };
            
            // Maintenance info based on materials
            const materialMaintenanceMap = {
                'Wood': {
                    cleaning: "Dust regularly and clean with wood cleaner",
                    care: ["Avoid direct sunlight", "Use coasters for drinks", "Polish periodically"],
                    lifespan: "10-30 years with proper care"
                },
                'Fabric': {
                    cleaning: "Vacuum regularly and spot clean as needed",
                    care: ["Professional cleaning recommended for stains", "Rotate cushions regularly", "Avoid direct sunlight"],
                    lifespan: "5-15 years depending on quality and use"
                },
                'Metal': {
                    cleaning: "Wipe with damp cloth and dry thoroughly",
                    care: ["Apply metal polish periodically", "Protect from scratches", "Check for rust"],
                    lifespan: "15-25 years with proper care"
                },
                'Glass': {
                    cleaning: "Clean with glass cleaner and lint-free cloth",
                    care: ["Handle with care", "Avoid placing hot items directly on surface"],
                    lifespan: "10+ years with careful use"
                },
                'Leather': {
                    cleaning: "Dust and wipe with leather cleaner",
                    care: ["Condition twice a year", "Keep away from direct heat or sunlight", "Blot spills immediately"],
                    lifespan: "10-20 years with proper maintenance"
                }
            };
            
            // Set maintenance based on derived material
            const material = deriveMaterial(name);
            comparison.maintenance[id] = {
                cleaning: material && materialMaintenanceMap[material] ? materialMaintenanceMap[material].cleaning : "",
                care: material && materialMaintenanceMap[material] ? [...materialMaintenanceMap[material].care] : [],
                lifespan: material && materialMaintenanceMap[material] ? materialMaintenanceMap[material].lifespan : "",
                warranty: "Standard store return policy"
            };
        });
        
        // Create comparison summary
        const functionalDifferences = {
            title: "How These Products Serve Different Needs",
            differences: products.map(p => {
                const pType = p.derivedType;
                const price = p.price;
                
                // Create unique value proposition based on product attributes
                let uniqueValue;
                if (p.derivedSize === 'Single/Twin') {
                    uniqueValue = "Space-efficient sleeping solution for one person";
                } else if (['Queen', 'King'].includes(p.derivedSize)) {
                    uniqueValue = "Spacious sleeping area for couples";
                } else if (p.title.toLowerCase().includes('colorful')) {
                    uniqueValue = "Adds vibrant color accent to your space";
                } else if (p.title.toLowerCase().includes('ergonomic')) {
                    uniqueValue = "Designed for optimal body support and comfort";
                } else if (p.title.toLowerCase().includes('storage')) {
                    uniqueValue = "Provides additional storage solutions";
                } else {
                    uniqueValue = "Adds style and functionality to your space";
                }
                
                // Create recommendation for when to choose this product
                let whenToChoose;
                if (price === cheapestPrice) {
                    whenToChoose = "Choose when looking for the most affordable option";
                } else if (price === mostExpensivePrice) {
                    whenToChoose = "Choose when premium quality is your priority";
                } else {
                    whenToChoose = "Choose for a balance of quality and affordability";
                }
                
                return {
                    id: p._id.toString(),
                    title: p.title,
                    primaryFunction: comparison.function[p._id.toString()].primaryFunction,
                    uniqueValue,
                    whenToChoose
                };
            })
        };
        
        // Extract technical specs for comparison
        const techSpecs = [];
        
        // Add size comparison
        techSpecs.push({
            name: "Size",
            values: products.reduce((acc, p) => {
                acc[p._id.toString()] = p.size || p.derivedSize || "Standard";
                return acc;
            }, {})
        });
        
        // If products have colors, compare them
        if (products.some(p => p.color)) {
            techSpecs.push({
                name: "Color",
                values: products.reduce((acc, p) => {
                    const name = p.title.toLowerCase();
                    acc[p._id.toString()] = p.color || 
                        (name.includes('colorful') ? "Colorful" : 
                         name.includes('white') ? "White" :
                         name.includes('black') ? "Black" :
                         name.includes('blue') ? "Blue" :
                         name.includes('red') ? "Red" :
                         "Not specified");
                    return acc;
                }, {})
            });
        }
        
        // Add material comparison based on name inference
        techSpecs.push({
            name: "Material",
            values: products.reduce((acc, p) => {
                acc[p._id.toString()] = deriveMaterial(p.title);
                return acc;
            }, {})
        });
        
        // Determine best choice recommendations
        const bestChoice = {
            forFunctionality: {},
            forAesthetics: {},
            forValue: {}
        };
        
        // Best value product (based on price only since we don't have ratings)
        const cheapestProduct = products.find(p => p.price === cheapestPrice);
        bestChoice.forValue = {
            id: cheapestProduct._id.toString(),
            title: cheapestProduct.title,
            reason: `Most affordable option among compared items`
        };
        
        // For aesthetics, prefer colorful or items with aesthetic terms in name
        const aestheticTerms = [
            { term: 'colorful', weight: 10 },
            { term: 'modern', weight: 5 },
            { term: 'elegant', weight: 8 },
            { term: 'stylish', weight: 7 },
            { term: 'design', weight: 4 },
            { term: 'decorative', weight: 6 },
            { term: 'artistic', weight: 9 }
        ];
        
        const aestheticProducts = products
            .map(p => {
                const name = p.title.toLowerCase();
                let score = 0;
                
                aestheticTerms.forEach(item => {
                    if (name.includes(item.term)) {
                        score += item.weight;
                    }
                });
                
                return {
                    id: p._id.toString(),
                    title: p.title,
                    score
                };
            })
            .sort((a, b) => b.score - a.score);
        
        if (aestheticProducts.length > 0 && aestheticProducts[0].score > 0) {
            bestChoice.forAesthetics = {
                id: aestheticProducts[0].id,
                title: aestheticProducts[0].title,
                reason: `Best aesthetic option based on style and design features`
            };
        }
        
        // Best functionality based on features and unique capabilities
        const functionalityScore = products.map(p => {
            const id = p._id.toString();
            return {
                id,
                title: p.title,
                score: (comparison.function[id].secondaryFunctions.length * 2) + 
                       (comparison.function[id].uniqueCapabilities?.length || 0) +
                       (p.title.toLowerCase().includes('ergonomic') ? 3 : 0) +
                       (p.title.toLowerCase().includes('multifunctional') ? 4 : 0) +
                       (p.title.toLowerCase().includes('adjustable') ? 2 : 0)
            };
        }).sort((a, b) => b.score - a.score);
        
        if (functionalityScore.length > 0 && functionalityScore[0].score > 0) {
            bestChoice.forFunctionality = {
                id: functionalityScore[0].id,
                title: functionalityScore[0].title,
                reason: "Offers the most functional features and versatility"
            };
        }
        
        // Get references to cheapest and most expensive products for buying advice
        const expensiveProduct = products.find(p => p.price === mostExpensivePrice);
        const priceDiff = mostExpensivePrice - cheapestPrice;
        const priceDiffPercent = Math.round((priceDiff / cheapestPrice) * 100);
        
        // Create direct price comparison text
        const priceInfoText = `The ${expensiveProduct.title} is $${priceDiff.toFixed(2)} (${priceDiffPercent}%) more expensive than the ${cheapestProduct.title}.`;
        
        // Generate product-specific buying advice based on product type patterns
        let buyingAdvice = "";
        
        // Determine what types of products we're comparing
        const productTypes = products.map(p => p.derivedType);
        const uniqueTypes = [...new Set(productTypes)];
        
        // If all products are the same type, give specific advice
        if (uniqueTypes.length === 1) {
            const type = uniqueTypes[0];
            
            const buyingAdviceMap = {
                'sofa': {
                    hasSize: products.some(p => 
                        p.size === 'Small' || 
                        p.title.toLowerCase().includes('small') ||
                        p.title.toLowerCase().includes('compact')),
                    sizeAdvice: `When choosing between these sofas, consider your available space. The smaller sofa (${cheapestProduct.title}, $${cheapestProduct.price.toFixed(2)}) works better in compact rooms or apartments, while the standard-sized sofa (${expensiveProduct.title}, $${expensiveProduct.price.toFixed(2)}) offers more seating capacity for larger living areas. ${priceInfoText} Think about how many people typically need seating in your home and measure your space before deciding.`,
                    generalAdvice: `These sofas differ primarily in styling and price point. The more premium option (${expensiveProduct.title}, $${expensiveProduct.price.toFixed(2)}) likely offers enhanced comfort or durability features, while the more affordable option (${cheapestProduct.title}, $${cheapestProduct.price.toFixed(2)}) provides good value. ${priceInfoText} Consider how the color and design will coordinate with your existing decor and how frequently the sofa will be used when making your selection.`
                },
                'bed': {
                    hasSize: products.some(p => 
                        ['Single/Twin', 'Double', 'Queen', 'King'].includes(p.size || p.derivedSize)),
                    sizeAdvice: `When choosing between these beds, consider your room size and sleeping needs. Larger beds offer more space but require larger rooms, while single beds work well for one person or smaller spaces. ${priceInfoText} The price ranges from $${cheapestPrice.toFixed(2)} for the ${cheapestProduct.title} to $${mostExpensivePrice.toFixed(2)} for the ${expensiveProduct.title}. Measure your room carefully to ensure proper fit and consider who will be using the bed regularly.`,
                    generalAdvice: `When selecting between these beds, consider the design, material quality, and comfort features. The more premium option (${expensiveProduct.title}, $${expensiveProduct.price.toFixed(2)}) may offer better support or durability, while the more affordable option (${cheapestProduct.title}, $${cheapestProduct.price.toFixed(2)}) provides good value. ${priceInfoText} Your sleeping preferences and how long you plan to use the bed should guide your decision.`
                },
                'table': {
                    generalAdvice: `When selecting between these tables, consider how you'll use it most frequently - for dining, work, or decoration. The ${cheapestProduct.title} ($${cheapestPrice.toFixed(2)}) and ${expensiveProduct.title} ($${mostExpensivePrice.toFixed(2)}) differ in price by $${priceDiff.toFixed(2)}. The size, height, and sturdiness should match your primary use case, and the style should complement your room's aesthetic.`
                },
                'chair': {
                    generalAdvice: `When choosing between these chairs, consider comfort for your primary use case, whether it's dining, working, or relaxing. Prices range from $${cheapestPrice.toFixed(2)} for the ${cheapestProduct.title} to $${mostExpensivePrice.toFixed(2)} for the ${expensiveProduct.title}. The size should be appropriate for your space, and the style should complement your existing furniture.`
                },
                'lamp': {
                    generalAdvice: `When selecting between these lamps, consider the lighting needs of your space - ambient, task, or accent lighting. The ${cheapestProduct.title} costs $${cheapestPrice.toFixed(2)} while the ${expensiveProduct.title} is priced at $${mostExpensivePrice.toFixed(2)}. The size should be proportional to the surface it sits on, and the style should enhance your room's decor.`
                }
            };
            
            if (buyingAdviceMap[type]) {
                // Use size-specific advice if available and size variations exist
                if (buyingAdviceMap[type].hasSize) {
                    buyingAdvice = buyingAdviceMap[type].sizeAdvice;
                } else {
                    buyingAdvice = buyingAdviceMap[type].generalAdvice;
                }
            } else {
                // Generic furniture advice for other types
                buyingAdvice = `When choosing between these furniture pieces, consider your space requirements, how the item will be used, and your existing decor. The ${expensiveProduct.title} ($${mostExpensivePrice.toFixed(2)}) is ${priceDiffPercent}% more expensive than the ${cheapestProduct.title} ($${cheapestPrice.toFixed(2)}). The more premium option may offer better quality or unique features, while the more affordable option provides good value.`;
            }
        } else {
            // Mixed product types
            buyingAdvice = `These products serve different purposes in your home. Consider what functionality you need most for your space. Prices range from $${cheapestPrice.toFixed(2)} for the ${cheapestProduct.title} to $${mostExpensivePrice.toFixed(2)} for the ${expensiveProduct.title}. Compare the price points in relation to how frequently you'll use each item and how long you plan to keep it.`;
        }
        
        // Complete comparison summary
        const summary = {
            products: products.map(p => ({
                id: p._id.toString(),
                title: p.title,
                price: p.price,
                image: p.img,
                summary: p.desc?.substring(0, 100) || ""
            })),
            functionalDifferences,
            technicalComparison: {
                title: "Technical Specifications Comparison",
                specs: techSpecs
            },
            bestChoice,
            buyingAdvice
        };
        
        return res.status(200).json({
            success: true,
            comparison,
            summary
        });
        
    } catch (error) {
        console.error('❌ Error comparing products:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to compare products',
            error: error.message
        });
    }
};



// Helper function to extract sentiment from reviews
function calculateReviewSentiment(reviews) {
    if (!reviews || reviews.length === 0) return null;
    
    // Simple sentiment analysis based on rating and keywords
    let positive = 0;
    let negative = 0;
    let neutral = 0;
    
    const positiveKeywords = ['love', 'great', 'excellent', 'perfect', 'amazing', 'good', 'best', 'happy', 'recommend'];
    const negativeKeywords = ['bad', 'poor', 'terrible', 'disappointing', 'waste', 'broken', 'defective', 'unhappy', 'avoid'];
    
    reviews.forEach(review => {
        // Rating-based sentiment
        if (review.rating >= 4) {
            positive++;
        } else if (review.rating <= 2) {
            negative++;
        } else {
            neutral++;
        }
        
        // Text-based sentiment (simplistic approach)
        if (review.text) {
            const lowerText = review.text.toLowerCase();
            
            let hasPositive = positiveKeywords.some(keyword => lowerText.includes(keyword));
            let hasNegative = negativeKeywords.some(keyword => lowerText.includes(keyword));
            
            if (hasPositive && !hasNegative) {
                positive += 0.5; // Add partial weight
            } else if (hasNegative && !hasPositive) {
                negative += 0.5;
            } else if (hasPositive && hasNegative) {
                neutral += 0.5;
            }
        }
    });
    
    const total = reviews.length * 1.5; // Adjusted for the text analysis weight
    
    return {
        positive: positive / total,
        negative: negative / total,
        neutral: neutral / total
    };
}
/**
 * Get related products to compare with a specific product
 * @route GET /api/products/:id/comparison-options
 */
exports.getComparisonOptions = async (req, res) => {
    console.log(`🔍 Get comparison options for product ${req.params.id}`);
    
    try {
        const productId = req.params.id;
        const { limit = 5 } = req.query;
        
        // Validate product ID
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            console.log('❌ Invalid product ID format');
            return res.status(400).json({ 
                success: false,
                message: "Invalid product ID format" 
            });
        }
        
        // Get the source product
        const product = await Product.findById(productId);
        
        if (!product) {
            console.log(`❌ Product not found: ${productId}`);
            return res.status(404).json({ 
                success: false,
                message: "Product not found" 
            });
        }
        
        console.log(`✅ Found source product: ${product.title || product._id}`);
        
        // Extract product categories and price range
        const categories = product.categories || [];
        const price = product.price || 0;
        const priceRange = {
            min: Math.max(0, price * 0.7),  // 30% lower
            max: price * 1.3                // 30% higher
        };
        
        console.log(`🔍 Finding comparison options in categories:`, categories);
        console.log(`💰 Price range: $${priceRange.min.toFixed(2)} - $${priceRange.max.toFixed(2)}`);
        
        // Build query for similar products
        const query = {
            _id: { $ne: productId }, // Exclude the current product
            $or: [
                { categories: { $in: categories } },  // Same category
                { price: { $gte: priceRange.min, $lte: priceRange.max } } // Similar price
            ]
        };
        
        // Find comparison options
        const comparisonOptions = await Product.find(query)
            .limit(parseInt(limit))
            .sort({ rating: -1 });  // Sort by highest rated first
            
        console.log(`✅ Found ${comparisonOptions.length} comparison options`);
        
        // Create a score for each option based on similarity
        const optionsWithScore = comparisonOptions.map(option => {
            // Calculate category match score
            const categoryOverlap = option.categories ? 
                option.categories.filter(cat => categories.includes(cat)).length : 0;
            const categoryScore = categories.length > 0 ? 
                categoryOverlap / Math.max(categories.length, option.categories ? option.categories.length : 1) : 0;
            
            // Calculate price similarity (1 = exact match, 0 = at the edge of range)
            const priceDiff = Math.abs(option.price - price);
            const priceRange = price * 0.3;  // 30% range
            const priceScore = 1 - (priceDiff / priceRange);
            
            // Calculate feature similarity if features exist
            let featureScore = 0;
            if (product.features && option.features && 
                Array.isArray(product.features) && Array.isArray(option.features)) { 
                const productFeatureCategories = product.features.map(f => f.category);
                const optionFeatureCategories = option.features.map(f => f.category);
                
                const commonCategories = productFeatureCategories.filter(cat => 
                    optionFeatureCategories.includes(cat)
                );
                featureScore = productFeatureCategories.length > 0 ? 
                    commonCategories.length / productFeatureCategories.length : 0;
            }
            // Combined similarity score (weighted)
            const similarityScore = (
                (categoryScore * 0.4) + 
                (priceScore * 0.4) + 
                (featureScore * 0.2)
            ).toFixed(2);
            
            return {
                ...option.toObject(),
                similarityScore: parseFloat(similarityScore),
                categoryScore: parseFloat(categoryScore.toFixed(2)),
                priceScore: parseFloat(priceScore.toFixed(2)),
                featureScore: parseFloat(featureScore.toFixed(2))
            };
        });
        
        // Sort by similarity score
        optionsWithScore.sort((a, b) => b.similarityScore - a.similarityScore);
        
        return res.status(200).json({
            success: true,
            sourceProduct: {
                id: product._id,
                title: product.title || product.name,
                price: product.price,
                categories: product.categories
            },
            comparisonOptions: optionsWithScore
        });
        
    } catch (error) {
        console.error('❌ Error getting comparison options:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get comparison options',
            error: error.message
        });
    }
};

// Debug/diagnostic endpoint
exports.debugInfo = (req, res) => {
    console.log('🛠️ Debug route accessed');
    console.log('📋 Headers:', req.headers);
    console.log('🔑 Authorization header:', req.headers.authorization);
    
    return res.status(200).json({ 
        message: "Debug route working", 
        headers: req.headers,
        auth: req.headers.authorization ? "Authorization header present" : "No authorization header"
    });
};