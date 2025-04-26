const Review = require('../models/reviews');
const Product = require('../models/product');
const mongoose = require('mongoose');
console.log('🔄 reviewController module initialized');

// Helper function to safely convert string to ObjectId
const toObjectId = (id) => {
    console.log(`🔍 Attempting to convert ID to ObjectId: ${id}`);
    if (!id) {
        console.log('❌ ID is null or undefined, returning null');
        return null;
    }
    try {
        const objectId = new mongoose.Types.ObjectId(id);
        console.log(`✅ Successfully converted to ObjectId: ${objectId}`);
        return objectId;
    } catch (err) {
        console.log(`❌ Failed to convert to ObjectId: ${err.message}`);
        return null;
    }
};

// Create a new review
exports.createReview = async (req, res) => {
    console.log('⭐ POST /review - Create review request received');
    console.log('📦 Request body:', req.body);
    console.log('🔑 Auth headers:', req.headers.authorization ? 'Present' : 'Missing');
    
    try {
        console.log('🔄 Extracting data from request body');
        const { productId, userId, rating, title, comment, images } = req.body;
        console.log(`📋 Extracted data: productId=${productId}, userId=${userId}, rating=${rating}, title length=${title?.length}, comment length=${comment?.length}, images count=${images?.length || 0}`);
        
        // Validate required fields
        console.log('🔄 Validating required fields');
        if (!productId || !userId || !rating || !title || !comment) {
            console.log('❌ Missing required fields');
            console.log(`Missing fields check: productId=${!productId}, userId=${!userId}, rating=${!rating}, title=${!title}, comment=${!comment}`);
            return res.status(400).json({ 
                message: "Missing required fields. Please provide productId, userId, rating, title, and comment." 
            });
        }
        
        // Validate rating
        console.log(`🔄 Validating rating value: ${rating}`);
        if (rating < 1 || rating > 5) {
            console.log(`❌ Invalid rating value: ${rating}`);
            return res.status(400).json({ message: "Rating must be between 1 and 5" });
        }
        
        // Check if productId and userId are valid MongoDB ObjectIds
        console.log(`🔄 Validating MongoDB ObjectId formats: productId=${productId}, userId=${userId}`);
        console.log(`productId validity: ${mongoose.Types.ObjectId.isValid(productId)}`);
        console.log(`userId validity: ${mongoose.Types.ObjectId.isValid(userId)}`);
        
        if (!mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(userId)) {
            console.log('❌ Invalid ID format');
            return res.status(400).json({ message: "Invalid productId or userId format" });
        }
        
        // Check if product exists
        console.log(`🔄 Finding product with id: ${productId}`);
        const product = await Product.findById(productId);
        console.log(`🔍 Product exists: ${!!product}`);
        if (!product) {
            console.log(`❌ Product not found: ${productId}`);
            return res.status(404).json({ message: "Product not found" });
        }
        
        // Check if user already reviewed this product
        console.log(`🔄 Checking for existing review by user ${userId} for product ${productId}`);
        const existingReview = await Review.findOne({ 
            productId: toObjectId(productId),
            userId: toObjectId(userId)
        });
        console.log(`🔍 Existing review found: ${!!existingReview}`);
        
        if (existingReview) {
            console.log(`❌ User ${userId} already reviewed product ${productId}`);
            console.log(`Existing review ID: ${existingReview._id}`);
            return res.status(400).json({ 
                message: "You have already reviewed this product. Please edit your existing review instead." 
            });
        }
        
        // Create review
        console.log('💾 Creating new review object');
        const newReview = new Review({
            productId: toObjectId(productId),
            userId: toObjectId(userId),
            rating,
            title,
            comment,
            images: images || [],
            verifiedPurchase: false // Set this based on order history check
        });
        console.log('📋 New review object created with data:', JSON.stringify(newReview));
        
        console.log('💾 Saving review to database...');
        const savedReview = await newReview.save();
        console.log(`✅ Review saved to database with ID: ${savedReview._id}`);
        
        // Update product with new average rating
        console.log(`🔄 Updating product ${productId} with new rating data...`);
        console.log('🔍 Finding all non-rejected reviews for this product');
        const allProductReviews = await Review.find({ 
            productId: toObjectId(productId),
            status: { $ne: 'rejected' }
        });
        console.log(`📊 Found ${allProductReviews.length} valid reviews for rating calculation`);
        
        console.log('📊 Calculating new average rating');
        const totalRating = allProductReviews.reduce((sum, review) => {
            console.log(`Adding rating ${review.rating} to sum ${sum}`);
            return sum + review.rating;
        }, 0);
        console.log(`📊 Total rating sum: ${totalRating}`);
        
        const averageRating = totalRating / allProductReviews.length;
        console.log(`📊 New average rating: ${averageRating}`);
        
        console.log('💾 Updating product document with new rating data');
        await Product.findByIdAndUpdate(productId, { 
            $set: { 
                averageRating: parseFloat(averageRating.toFixed(1)),
                reviewCount: allProductReviews.length 
            } 
        });
        
        console.log(`✅ Product ${productId} updated with new average rating: ${averageRating}`);
        
        console.log('🔄 Preparing response');
        return res.status(201).json({
            message: "Review created successfully",
            review: savedReview,
            averageRating: parseFloat(averageRating.toFixed(1))
        });
    } catch (error) {
        console.error('❌ Error creating review:', error);
        console.error('❌ Error stack:', error.stack);
        
        // Handle duplicate key error (user already reviewed this product)
        if (error.code === 11000) {
            console.log('🔍 Detected duplicate key error (user already reviewed this product)');
            return res.status(400).json({
                message: "You have already reviewed this product"
            });
        }
        
        return res.status(500).json({
            message: "Failed to create review",
            error: error.message
        });
    }
};

// Get reviews for a specific product
exports.getProductReviews = async (req, res) => {
    console.log(`⭐ GET /product/${req.params.productId}/reviews - Get product reviews request received`);
    console.log('🔑 Auth headers:', req.headers.authorization ? 'Present' : 'Missing');
    console.log('🔄 Request params:', req.params);
    console.log('🔄 Query parameters:', req.query);
    
    try {
        const { productId } = req.params;
        console.log(`🔍 Extracted productId: ${productId}`);
        
        const { rating, sort, page = 1, limit = 10 } = req.query;
        console.log(`🔍 Using pagination: page=${page}, limit=${limit}`);
        console.log(`🔍 Using filters: rating=${rating || 'all'}, sort=${sort || 'default'}`);
        
        console.log(`🔄 Validating product ID format: ${productId}`);
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            console.log(`❌ Invalid product ID format: ${productId}`);
            return res.status(400).json({ message: "Invalid product ID format" });
        }
        
        console.log(`🔄 Building query for product: ${productId}`);
        let query = { 
            productId: new mongoose.Types.ObjectId(productId)
        };
        
        // Filter by rating if specified (optional)
        if (rating) {
            console.log(`🔍 Adding rating filter: ${rating}`);
            query.rating = parseInt(rating);
        }
        
        // Debug: Log the query we're using
        console.log('🔎 Using query:', JSON.stringify(query));
        
        // Build sort options
        console.log(`🔄 Building sort options for: ${sort}`);
        let sortOptions = {};
        if (sort === 'newest') {
            sortOptions.createdAt = -1;
            console.log('🔍 Sorting by newest first');
        } else if (sort === 'oldest') {
            sortOptions.createdAt = 1;
            console.log('🔍 Sorting by oldest first');
        } else if (sort === 'highest') {
            sortOptions.rating = -1;
            console.log('🔍 Sorting by highest rating');
        } else if (sort === 'lowest') {
            sortOptions.rating = 1;
            console.log('🔍 Sorting by lowest rating');
        } else {
            // Default sort by newest
            sortOptions.createdAt = -1;
            console.log('🔍 Using default sort: newest first');
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        console.log(`🔍 Pagination calculated: skip=${skip}, limit=${limit}`);
        
        // Get reviews with pagination
        console.log('🔄 Executing database query for reviews');
        const reviews = await Review.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit))
            .populate('userId', 'username img'); // Get user details
        
        // Add debug output to see what's being returned
        console.log(`🔍 Raw query results: Found ${reviews.length} reviews`);
        if (reviews.length > 0) {
            console.log('📋 First review sample:', {
                id: reviews[0]._id,
                productId: reviews[0].productId,
                userId: reviews[0].userId
            });
        }
        
        // Count total reviews matching query for pagination
        console.log('🔄 Counting total reviews for pagination');
        const totalReviews = await Review.countDocuments(query);
        console.log(`🔍 Total reviews count: ${totalReviews}`);
        
        // Get rating distribution - removed any status filter here too
        console.log('🔄 Running aggregation for rating distribution');
        const ratingDistribution = await Review.aggregate([
            { $match: { productId: new mongoose.Types.ObjectId(productId) } },
            { $group: { _id: "$rating", count: { $sum: 1 } } },
            { $sort: { _id: -1 } }
        ]);
        console.log('🔍 Raw rating distribution:', ratingDistribution);
        
        // Format distribution for easier frontend use
        console.log('🔄 Formatting rating distribution');
        const distributionMap = {};
        ratingDistribution.forEach(item => {
            console.log(`🔍 Rating ${item._id}: ${item.count} reviews`);
            distributionMap[item._id] = item.count;
        });
        
        // Format final distribution with all ratings 1-5
        const formattedDistribution = {
            5: distributionMap[5] || 0,
            4: distributionMap[4] || 0,
            3: distributionMap[3] || 0,
            2: distributionMap[2] || 0,
            1: distributionMap[1] || 0
        };
        console.log('📊 Formatted distribution:', formattedDistribution);
        
        console.log(`✅ Found ${reviews.length} reviews for product ${productId}`);
        
        console.log('🔄 Preparing response with all data');
        return res.status(200).json({
            reviews,
            totalReviews,
            totalPages: Math.ceil(totalReviews / parseInt(limit)),
            currentPage: parseInt(page),
            ratingDistribution: formattedDistribution
        });
    } catch (error) {
        console.error('❌ Error fetching product reviews:', error);
        console.error('❌ Error stack trace:', error.stack);
        return res.status(500).json({
            message: "Failed to fetch product reviews",
            error: error.message
        });
    }
};

// Get reviews by a specific user
exports.getUserReviews = async (req, res) => {
    console.log(`⭐ GET /user/${req.params.userId}/reviews - Get user reviews request received`);
    console.log('🔑 Auth headers:', req.headers.authorization ? 'Present' : 'Missing');
    console.log('🔄 Request params:', req.params);
    console.log('🔄 Query parameters:', req.query);
    
    try {
        const { userId } = req.params;
        console.log(`🔍 Extracted userId: ${userId}`);
        
        const { page = 1, limit = 10 } = req.query;
        console.log(`🔍 Using pagination: page=${page}, limit=${limit}`);
        
        console.log(`🔄 Validating user ID format: ${userId}`);
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            console.log(`❌ Invalid user ID format: ${userId}`);
            return res.status(400).json({ message: "Invalid user ID format" });
        }
        
        console.log(`🔄 Finding reviews by user: ${userId}`);
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        console.log(`🔍 Pagination calculated: skip=${skip}, limit=${limit}`);
        
        console.log('🔄 Executing database query for user reviews');
        const reviews = await Review.find({ userId: toObjectId(userId) })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('productId', 'title img price') // Get product details
            .lean();
        
        console.log(`🔍 Raw query results: Found ${reviews.length} reviews`);
        if (reviews.length > 0) {
            console.log('📋 First review sample:', {
                id: reviews[0]._id,
                productId: reviews[0].productId,
                userId: reviews[0].userId
            });
        }
        
        console.log('🔄 Counting total reviews for pagination');
        const totalReviews = await Review.countDocuments({ userId: toObjectId(userId) });
        console.log(`🔍 Total user reviews count: ${totalReviews}`);
        
        console.log(`✅ Found ${reviews.length} reviews by user ${userId}`);
        
        console.log('🔄 Preparing response');
        return res.status(200).json({
            reviews,
            totalReviews,
            totalPages: Math.ceil(totalReviews / parseInt(limit)),
            currentPage: parseInt(page)
        });
    } catch (error) {
        console.error('❌ Error fetching user reviews:', error);
        console.error('❌ Error stack trace:', error.stack);
        return res.status(500).json({
            message: "Failed to fetch user reviews",
            error: error.message
        });
    }
};

// Update an existing review
exports.updateReview = async (req, res) => {
    console.log(`📝 PUT /review/${req.params.id} - Update review request received`);
    console.log('🔑 Auth headers:', req.headers.authorization ? 'Present' : 'Missing');
    console.log('🔄 Request params:', req.params);
    console.log('📦 Request body:', req.body);
    
    try {
        const { id } = req.params;
        console.log(`🔍 Review ID to update: ${id}`);
        
        const { rating, title, comment, images } = req.body;
        console.log(`🔍 Update data: rating=${rating}, title length=${title?.length}, comment length=${comment?.length}, images count=${images?.length || 0}`);
        
        const userId = req.body.userId; // For authorization
        console.log(`🔍 User ID for authorization: ${userId}`);
        
        console.log(`🔄 Validating review ID format: ${id}`);
        if (!mongoose.Types.ObjectId.isValid(id)) {
            console.log(`❌ Invalid review ID format: ${id}`);
            return res.status(400).json({ message: "Invalid review ID format" });
        }
        
        // Find the review
        console.log(`🔄 Finding review: ${id}`);
        const review = await Review.findById(id);
        console.log(`🔍 Review exists: ${!!review}`);
        
        if (!review) {
            console.log(`❌ Review not found: ${id}`);
            return res.status(404).json({ message: "Review not found" });
        }
        
        // Authorization check: ensure the user updating is the one who created it
        console.log(`🔄 Authorization check: comparing ${userId} with ${review.userId}`);
        console.log(`🔍 Review owner ID type: ${typeof review.userId}`);
        console.log(`🔍 Review owner ID string: ${review.userId.toString()}`);
        console.log(`🔍 User ID matches: ${userId && review.userId.toString() === userId}`);
        
        if (userId && review.userId.toString() !== userId) {
            console.log(`❌ Unauthorized: User ${userId} attempting to update review by ${review.userId}`);
            return res.status(403).json({ message: "You can only update your own reviews" });
        }
        
        // Update fields if provided
        console.log('🔄 Updating review fields');
        if (rating !== undefined) {
            console.log(`🔍 Validating new rating: ${rating}`);
            if (rating < 1 || rating > 5) {
                console.log(`❌ Invalid rating value: ${rating}`);
                return res.status(400).json({ message: "Rating must be between 1 and 5" });
            }
            console.log(`🔄 Updating rating from ${review.rating} to ${rating}`);
            review.rating = rating;
        }
        
        if (title !== undefined) {
            console.log(`🔄 Updating title from "${review.title}" to "${title}"`);
            review.title = title;
        }
        
        if (comment !== undefined) {
            console.log(`🔄 Updating comment from length ${review.comment?.length} to length ${comment.length}`);
            review.comment = comment;
        }
        
        if (images !== undefined) {
            console.log(`🔄 Updating images from count ${review.images?.length || 0} to count ${images.length || 0}`);
            review.images = images;
        }
        
        // Reset status to pending if content changed significantly
        if (rating !== undefined || title !== undefined || comment !== undefined) {
            console.log('🔄 Content changed significantly, resetting status to pending');
            review.status = 'pending';
        }
        
        console.log('💾 Saving updated review...');
        const updatedReview = await review.save();
        console.log(`✅ Review updated successfully: ${id}`);
        
        // Update product average rating
        const productId = review.productId;
        console.log(`🔄 Updating product ${productId} with new rating data...`);
        
        console.log('🔍 Finding all non-rejected reviews for this product');
        const allProductReviews = await Review.find({ 
            productId: productId,
            status: { $ne: 'rejected' }
        });
        console.log(`📊 Found ${allProductReviews.length} valid reviews for rating calculation`);
        
        console.log('📊 Calculating new average rating');
        const totalRating = allProductReviews.reduce((sum, review) => sum + review.rating, 0);
        console.log(`📊 Total rating sum: ${totalRating}`);
        
        const averageRating = totalRating / allProductReviews.length;
        console.log(`📊 New average rating: ${averageRating}`);
        
        console.log('💾 Updating product document with new rating data');
        await Product.findByIdAndUpdate(productId, { 
            $set: { 
                averageRating: parseFloat(averageRating.toFixed(1)),
                reviewCount: allProductReviews.length 
            } 
        });
        
        console.log(`✅ Product ${productId} updated with new average rating: ${averageRating}`);
        
        console.log('🔄 Preparing response');
        return res.status(200).json({
            message: "Review updated successfully",
            review: updatedReview,
            averageRating: parseFloat(averageRating.toFixed(1))
        });
    } catch (error) {
        console.error('❌ Error updating review:', error);
        console.error('❌ Error stack trace:', error.stack);
        return res.status(500).json({
            message: "Failed to update review",
            error: error.message
        });
    }
};

// Delete a review
exports.deleteReview = async (req, res) => {
    console.log(`🗑️ DELETE /review/${req.params.id} - Delete review request received`);
    console.log('🔑 Auth headers:', req.headers.authorization ? 'Present' : 'Missing');
    console.log('🔄 Request params:', req.params);
    console.log('🔄 Query parameters:', req.query);
    
    try {
        const { id } = req.params;
        console.log(`🔍 Review ID to delete: ${id}`);
        
        const userId = req.query.userId; // For authorization
        console.log(`🔍 User ID for authorization: ${userId}`);
        
        console.log(`🔄 Validating review ID format: ${id}`);
        if (!mongoose.Types.ObjectId.isValid(id)) {
            console.log(`❌ Invalid review ID format: ${id}`);
            return res.status(400).json({ message: "Invalid review ID format" });
        }
        
        // Find the review
        console.log(`🔄 Finding review: ${id}`);
        const review = await Review.findById(id);
        console.log(`🔍 Review exists: ${!!review}`);
        
        if (!review) {
            console.log(`❌ Review not found: ${id}`);
            return res.status(404).json({ message: "Review not found" });
        }
        
        // Authorization check: ensure the user deleting is the one who created it
        console.log(`🔄 Authorization check: comparing ${userId} with ${review.userId}`);
        console.log(`🔍 Review owner ID string: ${review.userId.toString()}`);
        console.log(`🔍 User ID matches: ${userId && review.userId.toString() === userId}`);
        
        if (userId && review.userId.toString() !== userId) {
            console.log(`❌ Unauthorized: User ${userId} attempting to delete review by ${review.userId}`);
            return res.status(403).json({ message: "You can only delete your own reviews" });
        }
        
        const productId = review.productId;
        console.log(`🔍 Product ID associated with review: ${productId}`);
        
        // Delete the review
        console.log(`🔄 Deleting review: ${id}`);
        await Review.findByIdAndDelete(id);
        console.log(`✅ Review deleted successfully: ${id}`);
        
        // Update product average rating
        console.log(`🔄 Updating product ${productId} with new rating data...`);
        
        console.log('🔍 Finding all non-rejected reviews for this product');
        const allProductReviews = await Review.find({ 
            productId: productId,
            status: { $ne: 'rejected' }
        });
        console.log(`📊 Found ${allProductReviews.length} valid reviews for rating calculation`);
        
        let averageRating = 0;
        if (allProductReviews.length > 0) {
            console.log('📊 Calculating new average rating');
            const totalRating = allProductReviews.reduce((sum, review) => sum + review.rating, 0);
            console.log(`📊 Total rating sum: ${totalRating}`);
            
            averageRating = totalRating / allProductReviews.length;
            console.log(`📊 New average rating: ${averageRating}`);
        } else {
            console.log('📊 No reviews left, setting average rating to 0');
        }
        
        console.log('💾 Updating product document with new rating data');
        await Product.findByIdAndUpdate(productId, { 
            $set: { 
                averageRating: parseFloat(averageRating.toFixed(1)),
                reviewCount: allProductReviews.length 
            } 
        });
        
        console.log(`✅ Product ${productId} updated with new average rating: ${averageRating}`);
        
        console.log('🔄 Preparing response');
        return res.status(200).json({
            message: "Review deleted successfully",
            averageRating: parseFloat(averageRating.toFixed(1)),
            reviewCount: allProductReviews.length
        });
    } catch (error) {
        console.error('❌ Error deleting review:', error);
        console.error('❌ Error stack trace:', error.stack);
        return res.status(500).json({
            message: "Failed to delete review",
            error: error.message
        });
    }
};


exports.getAllReviews = async (req, res) => {
    console.log('⭐ GET /reviews - Get all reviews request received');
    console.log('🔑 Auth headers:', req.headers.authorization ? 'Present' : 'Missing');
    console.log('🔄 Query parameters:', req.query);
    
    try {
        // Extract query parameters with defaults
        const { rating, sort, page = 1, limit = 10, status } = req.query;
        console.log(`🔍 Using pagination: page=${page}, limit=${limit}`);
        console.log(`🔍 Using filters: rating=${rating || 'all'}, sort=${sort || 'default'}, status=${status || 'all'}`);
        
        // Build query based on filters
        let query = {};
        
        // Filter by rating if specified
        if (rating) {
            console.log(`🔍 Filtering by rating: ${rating}`);
            query.rating = parseInt(rating);
        }
        
        // Filter by status if specified (for admin)
        if (status) {
            console.log(`🔍 Filtering by status: ${status}`);
            query.status = status;
        }
        
        console.log('🔎 Using query:', JSON.stringify(query));
        
        // Build sort options
        console.log(`🔄 Building sort options for: ${sort}`);
        let sortOptions = {};
        if (sort === 'newest') {
            sortOptions.createdAt = -1;
        } else if (sort === 'oldest') {
            sortOptions.createdAt = 1;
        } else if (sort === 'highest') {
            sortOptions.rating = -1;
        } else if (sort === 'lowest') {
            sortOptions.rating = 1;
        } else {
            // Default sort by newest
            sortOptions.createdAt = -1;
        }
        
        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        console.log(`🔍 Pagination calculated: skip=${skip}, limit=${limit}`);
        
        // Execute query with pagination
        console.log('🔄 Executing database query for reviews');
        const reviews = await Review.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit))
            .populate('userId', 'username img')
            .populate('productId', 'title img price');
        
        console.log(`🔍 Raw query results: Found ${reviews.length} reviews`);
        
        // Count total reviews for pagination
        console.log('🔄 Counting total reviews for pagination');
        const totalReviews = await Review.countDocuments(query);
        console.log(`🔍 Total reviews count: ${totalReviews}`);
        
        // Get rating distribution
        console.log('🔄 Running aggregation for rating distribution');
        const ratingDistribution = await Review.aggregate([
            { $group: { _id: "$rating", count: { $sum: 1 } } },
            { $sort: { _id: -1 } }
        ]);
        console.log('🔍 Raw rating distribution:', ratingDistribution);
        
        // Format distribution for easier frontend use
        console.log('🔄 Formatting rating distribution');
        const distributionMap = {};
        ratingDistribution.forEach(item => {
            distributionMap[item._id] = item.count;
        });
        
        // Format final distribution with all ratings 1-5
        const formattedDistribution = {
            5: distributionMap[5] || 0,
            4: distributionMap[4] || 0,
            3: distributionMap[3] || 0,
            2: distributionMap[2] || 0,
            1: distributionMap[1] || 0
        };
        console.log('📊 Formatted distribution:', formattedDistribution);
        
        // Get flag level distribution if it exists in schema
        console.log('🔄 Running aggregation for flag level distribution');
        let flagDistribution = {};
        try {
            const flagAggregation = await Review.aggregate([
                { $match: { flagLevel: { $exists: true } } },
                { $group: { _id: "$flagLevel", count: { $sum: 1 } } }
            ]);
            
            // Format the flag distribution
            flagAggregation.forEach(item => {
                flagDistribution[item._id] = item.count;
            });
            console.log('📊 Flag distribution:', flagDistribution);
        } catch (err) {
            console.log('⚠️ Error getting flag distribution:', err.message);
        }
        
        console.log(`✅ Successfully retrieved ${reviews.length} reviews`);
        
        // Return formatted response
        return res.status(200).json({
            reviews,
            totalReviews,
            totalPages: Math.ceil(totalReviews / parseInt(limit)),
            currentPage: parseInt(page),
            ratingDistribution: formattedDistribution,
            flagDistribution
        });
    } catch (error) {
        console.error('❌ Error fetching all reviews:', error);
        console.error('❌ Error stack:', error.stack);
        return res.status(500).json({
            message: "Failed to fetch reviews",
            error: error.message
        });
    }
};

exports.getAllReviewUsers = async (req, res) => {
    console.log('⭐ GET /reviews/users - Get all review users request received');
    console.log('🔑 Auth headers:', req.headers.authorization ? 'Present' : 'Missing');
    console.log('🔄 Query parameters:', req.query);
    
    try {
        const { page = 1, limit = 10 } = req.query;
        console.log(`🔍 Using pagination: page=${page}, limit=${limit}`);
        
        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // Get unique users who have written reviews
        console.log('🔄 Aggregating unique users who have written reviews');
        const userIds = await Review.distinct('userId');
        console.log(`🔍 Found ${userIds.length} unique user IDs`);
        
        // Get user details
        console.log('🔄 Getting user details');
        const User = mongoose.model('User'); // Assuming your user model is called 'User'
        const users = await User.find({ _id: { $in: userIds } })
            .select('username img')
            .skip(skip)
            .limit(parseInt(limit));
        
        console.log(`🔍 Retrieved ${users.length} user details`);
        
        // Count total users for pagination
        const totalUsers = userIds.length;
        
        // Get review count per user
        console.log('🔄 Getting review count per user');
        const userReviewCounts = await Review.aggregate([
            { $group: { _id: "$userId", count: { $sum: 1 } } }
        ]);
        
        // Map review counts to user objects
        const usersWithCounts = users.map(user => {
            const userCount = userReviewCounts.find(count => 
                count._id.toString() === user._id.toString()
            );
            return {
                ...user.toObject(),
                reviewCount: userCount ? userCount.count : 0
            };
        });
        
        console.log(`✅ Successfully retrieved ${users.length} users with review counts`);
        
        return res.status(200).json({
            users: usersWithCounts,
            totalUsers,
            totalPages: Math.ceil(totalUsers / parseInt(limit)),
            currentPage: parseInt(page)
        });
    } catch (error) {
        console.error('❌ Error fetching review users:', error);
        console.error('❌ Error stack:', error.stack);
        return res.status(500).json({
            message: "Failed to fetch review users",
            error: error.message
        });
    }
};