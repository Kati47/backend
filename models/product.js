const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema({
    title: {type: String, required: true, unique: true},
    desc: {type: String, required: true},
    img: {type: String, required: true},
    categories: {type: Array},
    size: {type: String, required: true},
    color: {type: String, required: true},
    price: {type: Number, required: true},
    inStock: {type: Boolean, default: true},
    quantity: {type: Number, default: 10},
    lowStockThreshold: {type: Number, default: 5},
    model3d: new mongoose.Schema({  // Use a nested schema instead
        url: {type: String},
        format: {type: String, enum: ['glb', 'gltf', 'obj', 'fbx', 'usdz', 'sketchfab']},
        modelId: {type: String}, 
        hasThumbnail: {type: Boolean, default: false},
        thumbnailUrl: {type: String}
    }),
    // Tracking which users have favorited this product
    favoritedBy: [{
        userId: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
        addedAt: {type: Date, default: Date.now}
    }],
    
    // Tracking which users have saved this product for later
    savedForLaterBy: [{
        userId: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
        savedAt: {type: Date, default: Date.now},
        fromCart: {type: Boolean, default: false}
    }],
    
    // Counter fields for quick stats (maintained by pre/post hooks)
    favoriteCount: {type: Number, default: 0},
    savedForLaterCount: {type: Number, default: 0},
    averageRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
},
{timestamps: true}
);

// Update favorite count when favoritedBy array changes
ProductSchema.pre('save', function(next) {
    if (this.isModified('favoritedBy')) {
        this.favoriteCount = this.favoritedBy.length;
    }
    if (this.isModified('savedForLaterBy')) {
        this.savedForLaterCount = this.savedForLaterBy.length;
    }
    next();
});
// Update inStock status based on quantity
ProductSchema.pre('save', function(next) {
    if (this.isModified('quantity')) {
        this.inStock = this.quantity > 0;
    }
    next();
});

module.exports = mongoose.model("Product", ProductSchema);