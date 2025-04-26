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
    
    // 3D model fields (optional)
    model3d: {type: String, required: false}, // URL to 3D model (Sketchfab or direct file)
    model3dFormat: {type: String, required: false, enum: ['glb', 'gltf', 'obj', 'fbx', 'usdz', 'sketchfab', 'other']},
    model3dThumbnail: {type: String, required: false}, // Optional thumbnail for the 3D model
   
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

// Add a hook to extract model format from URL if provided
ProductSchema.pre('save', function(next) {
    if (this.isModified('model3d') && this.model3d) {
        // Try to determine format from URL extension
        const url = this.model3d;
        const extensionMatch = url.match(/\.([a-z0-9]+)($|\?)/i);
        if (extensionMatch && ['glb', 'gltf', 'obj', 'fbx', 'usdz'].includes(extensionMatch[1])) {
            this.model3dFormat = extensionMatch[1];
        } else if (url.includes('sketchfab.com')) {
            this.model3dFormat = 'sketchfab';
        } else {
            this.model3dFormat = 'other';
        }
    }
    next();
});

module.exports = mongoose.model("Product", ProductSchema);