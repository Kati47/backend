const mongoose = require('mongoose');

const roomPlannerSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // Optional to allow anonymous users
    },
    sessionId: {
        type: String,
        required: function() { return !this.userId; } // Required if no userId
    },
    roomType: {
        type: String,
        enum: ['living-room', 'bedroom', 'dining-room', 'office', 'kitchen', 'bathroom', 'outdoor', 'other'],
        required: true
    },
    name: {
        type: String,
        default: 'My Room Plan'
    },
    items: [{
        virtualItemId: String, // ID of the item in room planner system
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: false // Optional as some virtual items may not have real product matches
        },
        category: {
            type: String,
            required: true
        },
        style: String,
        color: String,
        material: String,
        dimensions: {
            width: Number,
            height: Number,
            depth: Number,
            unit: {
                type: String,
                default: 'cm'
            }
        },
        price: Number,
        position: {
            x: Number,
            y: Number,
            z: Number,
            rotation: Number
        },
        addedAt: {
            type: Date,
            default: Date.now
        }
    }],
    previewImage: {
        type: String, // URL to saved preview image
        default: null
    },
    isPublic: {
        type: Boolean,
        default: false
    },
    lastModified: {
        type: Date,
        default: Date.now
    },
    tags: [String],
    status: {
        type: String,
        enum: ['draft', 'saved', 'shared', 'archived'],
        default: 'draft'
    }
}, { timestamps: true });

// Add index for faster queries
roomPlannerSchema.index({ userId: 1, lastModified: -1 });
roomPlannerSchema.index({ sessionId: 1 });
roomPlannerSchema.index({ isPublic: 1 });

// Virtual for total items count
roomPlannerSchema.virtual('itemCount').get(function() {
    return this.items.length;
});

// Method to find similar store products for a room plan
roomPlannerSchema.methods.findSimilarProducts = async function() {
    // This will be implemented as part of the recommendation engine
    const Product = mongoose.model('Product');
    const similarProducts = [];
    
    // Get unique categories in this room plan
    const categories = [...new Set(this.items.map(item => item.category))];
    
    // For each category, find products with similar attributes
    for (const category of categories) {
        const itemsInCategory = this.items.filter(item => item.category === category);
        
        // Extract common attributes for matching
        const colors = [...new Set(itemsInCategory.map(item => item.color).filter(Boolean))];
        const styles = [...new Set(itemsInCategory.map(item => item.style).filter(Boolean))];
        const materials = [...new Set(itemsInCategory.map(item => item.material).filter(Boolean))];
        
        // Find matching products
        // Note: This is a simplified version, real implementation would use more sophisticated matching
        const matchingProducts = await Product.find({
            category: { $regex: category, $options: 'i' },
            $or: [
                { colors: { $in: colors } },
                { tags: { $in: styles } },
                { material: { $in: materials } }
            ]
        }).limit(5);
        
        similarProducts.push(...matchingProducts);
    }
    
    return similarProducts;
};

module.exports = mongoose.model('RoomPlanner', roomPlannerSchema);