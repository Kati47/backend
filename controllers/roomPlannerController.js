const RoomPlanner = require('../models/roomPlanner');
const Product = require('../models/product');
const mongoose = require('mongoose');
const util = require('util');

// Helper function to generate a random session ID
const generateSessionId = () => {
    return 'room_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// Create a new room plan
exports.createRoomPlan = async (req, res) => {
    try {
        const { roomType, name, items } = req.body;
        
        // Check if user is authenticated
        const userId = req.user ? req.user.id : null;
        
        // For anonymous users, use sessionId
        const sessionId = !userId ? (req.body.sessionId || generateSessionId()) : null;
        
        const roomPlan = new RoomPlanner({
            userId,
            sessionId,
            roomType,
            name: name || `My ${roomType.charAt(0).toUpperCase() + roomType.slice(1)}`,
            items: items || []
        });
        
        await roomPlan.save();
        
        res.status(201).json({
            success: true,
            roomPlan,
            sessionId // Return sessionId for anonymous users
        });
    } catch (error) {
        console.error('Error creating room plan:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating room plan',
            error: error.message
        });
    }
};

// Get room plans for a user
exports.getUserRoomPlans = async (req, res) => {
    try {
        const userId = req.user ? req.user.id : null;
        const { sessionId } = req.query;
        
        if (!userId && !sessionId) {
            return res.status(400).json({
                success: false,
                message: 'Either user authentication or sessionId is required'
            });
        }
        
        const query = userId ? { userId } : { sessionId };
        
        const roomPlans = await RoomPlanner.find(query)
            .sort({ lastModified: -1 })
            .select('-items.position'); // Exclude position data for list view
            
        res.status(200).json({
            success: true,
            count: roomPlans.length,
            roomPlans
        });
    } catch (error) {
        console.error('Error getting room plans:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving room plans',
            error: error.message
        });
    }
};

// Get a single room plan by ID
exports.getRoomPlan = async (req, res) => {
    try {
        const { id } = req.params;
        
        const roomPlan = await RoomPlanner.findById(id);
        
        if (!roomPlan) {
            return res.status(404).json({
                success: false,
                message: 'Room plan not found'
            });
        }
        
        // Check permission - user should own this room plan or it should be public
        const userId = req.user ? req.user.id : null;
        if (!roomPlan.isPublic && roomPlan.userId && roomPlan.userId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to access this room plan'
            });
        }
        
        res.status(200).json({
            success: true,
            roomPlan
        });
    } catch (error) {
        console.error('Error getting room plan:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving room plan',
            error: error.message
        });
    }
};

// Update a room plan
exports.updateRoomPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { roomType, name, items, previewImage, isPublic, status, tags } = req.body;
        
        const roomPlan = await RoomPlanner.findById(id);
        
        if (!roomPlan) {
            return res.status(404).json({
                success: false,
                message: 'Room plan not found'
            });
        }
        
        // Check permission - user should own this room plan
        const userId = req.user ? req.user.id : null;
        const sessionId = req.body.sessionId;
        
        if (roomPlan.userId && roomPlan.userId.toString() !== userId) {
            if (roomPlan.sessionId !== sessionId) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to update this room plan'
                });
            }
        }
        
        // Update fields if provided
        if (roomType) roomPlan.roomType = roomType;
        if (name) roomPlan.name = name;
        if (items) roomPlan.items = items;
        if (previewImage) roomPlan.previewImage = previewImage;
        if (typeof isPublic !== 'undefined') roomPlan.isPublic = isPublic;
        if (status) roomPlan.status = status;
        if (tags) roomPlan.tags = tags;
        
        // Update last modified timestamp
        roomPlan.lastModified = Date.now();
        
        await roomPlan.save();
        
        res.status(200).json({
            success: true,
            roomPlan
        });
    } catch (error) {
        console.error('Error updating room plan:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating room plan',
            error: error.message
        });
    }
};

// Delete a room plan
exports.deleteRoomPlan = async (req, res) => {
    try {
        const { id } = req.params;
        
        const roomPlan = await RoomPlanner.findById(id);
        
        if (!roomPlan) {
            return res.status(404).json({
                success: false,
                message: 'Room plan not found'
            });
        }
        
        // Check permission - user should own this room plan
        const userId = req.user ? req.user.id : null;
        const sessionId = req.query.sessionId;
        
        if (roomPlan.userId && roomPlan.userId.toString() !== userId) {
            if (roomPlan.sessionId !== sessionId) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to delete this room plan'
                });
            }
        }
        
        await roomPlan.remove();
        
        res.status(200).json({
            success: true,
            message: 'Room plan successfully deleted'
        });
    } catch (error) {
        console.error('Error deleting room plan:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting room plan',
            error: error.message
        });
    }
};

// Add an item to a room plan
exports.addItemToRoomPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const itemData = req.body;
        
        const roomPlan = await RoomPlanner.findById(id);
        
        if (!roomPlan) {
            return res.status(404).json({
                success: false,
                message: 'Room plan not found'
            });
        }
        
        // Check permission
        const userId = req.user ? req.user.id : null;
        const sessionId = req.body.sessionId;
        
        if (roomPlan.userId && roomPlan.userId.toString() !== userId) {
            if (roomPlan.sessionId !== sessionId) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to update this room plan'
                });
            }
        }
        
        // Add the item to the room plan
        roomPlan.items.push(itemData);
        roomPlan.lastModified = Date.now();
        
        await roomPlan.save();
        
        res.status(200).json({
            success: true,
            roomPlan
        });
    } catch (error) {
        console.error('Error adding item to room plan:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding item to room plan',
            error: error.message
        });
    }
};

// Get recommended products based on room plan
exports.getRecommendations = async (req, res) => {
    try {
        const { id } = req.params;
        
        const roomPlan = await RoomPlanner.findById(id);
        
        if (!roomPlan) {
            return res.status(404).json({
                success: false,
                message: 'Room plan not found'
            });
        }
        
        // Check permission for private room plans
        if (!roomPlan.isPublic) {
            const userId = req.user ? req.user.id : null;
            const sessionId = req.query.sessionId;
            
            if (roomPlan.userId && roomPlan.userId.toString() !== userId) {
                if (roomPlan.sessionId !== sessionId) {
                    return res.status(403).json({
                        success: false,
                        message: 'Not authorized to access this room plan'
                    });
                }
            }
        }
        
        // Get recommendations based on room plan items
        const recommendations = await getProductRecommendations(roomPlan);
        
        res.status(200).json({
            success: true,
            roomPlanId: id,
            recommendations
        });
    } catch (error) {
        console.error('Error getting recommendations:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting product recommendations',
            error: error.message
        });
    }
};

// Helper function to get product recommendations based on room plan
async function getProductRecommendations(roomPlan) {
    // Extract attributes from room plan items
    const categories = [...new Set(roomPlan.items.map(item => item.category))];
    const colors = [...new Set(roomPlan.items.map(item => item.color).filter(Boolean))];
    const styles = [...new Set(roomPlan.items.map(item => item.style).filter(Boolean))];
    const materials = [...new Set(roomPlan.items.map(item => item.material).filter(Boolean))];
    
    // Get existing product IDs in the room plan to exclude them from recommendations
    const existingProductIds = roomPlan.items
        .filter(item => item.productId)
        .map(item => item.productId);
    
    // Prepare recommendations object
    const recommendations = {
        similarProducts: [],
        complementaryProducts: [],
        mostPopular: []
    };
    
    // Find similar products based on category, color, style, and material
    const similarProducts = await Product.find({
        _id: { $nin: existingProductIds },
        categories: { $in: categories },
        $or: [
            { colors: { $in: colors } },
            { tags: { $in: styles.concat(materials) } }
        ]
    })
    .sort({ rating: -1 })
    .limit(8);
    
    recommendations.similarProducts = similarProducts;
    
    // Find complementary products (products from categories not in the room plan)
    // For example, if the room has sofas, suggest coffee tables or rugs
    const complementaryCategories = await getComplementaryCategories(categories);
    
    const complementaryProducts = await Product.find({
        _id: { $nin: existingProductIds },
        categories: { $in: complementaryCategories },
        // Optionally match by style/color for better coordination
        $or: [
            { colors: { $in: colors } },
            { tags: { $in: styles } }
        ]
    })
    .sort({ rating: -1 })
    .limit(8);
    
    recommendations.complementaryProducts = complementaryProducts;
    
    // Get most popular products in the room's category
    const popularProducts = await Product.find({
        _id: { $nin: existingProductIds },
        categories: { $in: categories }
    })
    .sort({ rating: -1, 'numReviews': -1 })
    .limit(8);
    
    recommendations.mostPopular = popularProducts;
    
    return recommendations;
}

// Helper function to map categories to complementary categories
async function getComplementaryCategories(categories) {
    // Define complementary relationships between categories
    const complementaryMap = {
        'sofa': ['coffee-table', 'rug', 'side-table', 'lamp'],
        'bed': ['nightstand', 'dresser', 'bedding', 'lamp'],
        'dining-table': ['dining-chair', 'sideboard', 'rug'],
        'desk': ['office-chair', 'bookshelf', 'desk-lamp'],
        // Add more mappings as needed
    };
    
    // Flatten the array of complementary categories
    const complementary = [];
    categories.forEach(category => {
        const mapped = complementaryMap[category] || [];
        complementary.push(...mapped);
    });
    
    // Return unique complementary categories
    return [...new Set(complementary)];
}

module.exports.getProductRecommendations = getProductRecommendations;