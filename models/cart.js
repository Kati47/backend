const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    products: [
        {
            productId: {
                type: String,
                required: true
            },
            quantity: {
                type: Number,
                default: 1,
                min: 1
            },
            title: String,
            desc: String,
            img: String,
            categories: [String],
            size: String,
            color: String,
            price: Number
        }
    ],
    promoCode: {
        code: String,
        promoId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PromoCode'
        },
        discountAmount: Number,
        discountType: String,
        message: String
    }
}, { timestamps: true });

module.exports = mongoose.model('Cart', cartSchema);