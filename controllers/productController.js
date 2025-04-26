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
 * Handles both simple lists and detailed room designs
 */
exports.getProductRecommendations = async (req, res) => {
    console.log('🪑 Get product recommendations request received');
    
    try {
        let furnitureItems = [];
        
        // Handle both GET and POST requests with different input formats
        if (req.method === 'GET') {
            console.log('🔍 Query parameters:', req.query);
            const { categories, limit = 8 } = req.query;
            
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
                
        } else {  // POST
            console.log('📦 Request body:', req.body);
            const { furniture, items } = req.body;
            
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
            byCategory: {}           // products organized by furniture type
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
            
            // Find primary products for this furniture type
            const primaryProducts = await Product.find({
                $or: [
                    { categories: { $in: mappedCategories } },
                    { title: { $regex: normalizedType, $options: 'i' } },
                    { tags: { $in: [normalizedType] } }
                ]
            })
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
                    
                    const complementaryProducts = await Product.find({
                        $or: [
                            { categories: { $in: complementaryCategoriesMapped } },
                            { title: { $regex: new RegExp(newComplementaryTypes.join('|'), 'i') } },
                            { tags: { $in: newComplementaryTypes } }
                        ]
                    })
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
        
        // Limit results to avoid overwhelming responses
        recommendations.primaryProducts = recommendations.primaryProducts.slice(0, limit * 2);
        recommendations.complementaryProducts = recommendations.complementaryProducts.slice(0, limit);
        
        console.log(`✅ Total recommendations - Primary: ${recommendations.primaryProducts.length}, Complementary: ${recommendations.complementaryProducts.length}`);
        
        return res.status(200).json({
            success: true,
            furnitureItems: uniqueFurnitureTypes,
            recommendations
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