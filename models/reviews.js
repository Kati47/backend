const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
       
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    comment: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000
    },
},
{
    timestamps: true
});

// Create compound index to ensure one review per user per product
ReviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("Review", ReviewSchema);