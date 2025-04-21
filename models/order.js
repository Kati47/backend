const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
    // Core identification
    userId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'User',
            required: true 
        },
    orderNumber: {type: String, unique: true}, 
    // Products with additional details to avoid extra queries
    products: [{
     productId: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Product',
            required: true 
        },
                title: {type: String, required: true}, // Store product title at time of order
        price: {type: Number, required: true}, // Store price at time of order
        quantity: {type: Number, default: 1, min: 1},
        img: {type: String}, // Product image URL
        color: {type: String}, 
        size: {type: String}
    }],
    
    // Financial details
    subtotal: {type: Number, required: true}, // Pre-tax, pre-shipping amount
    tax: {type: Number, default: 0},
    shippingCost: {type: Number, default: 0},
    discount: {type: Number, default: 0},
    amount: {type: Number, required: true}, // Final total amount
    currency: {type: String, default: "USD"},
    
    // Payment information
    isPaid: { 
        type: Boolean, 
        default: false 
    },
    paidAt: { 
        type: Date 
    },
    paymentMethod: { 
        type: String, 
        default: 'PayPal' 
    },
    paymentDetails: {
        provider: String, // "PayPal", "Stripe", etc.
        paypalOrderId: String,
        status: String,
        captureId: String,
        capturedAt: Date,
        paymentData: Object // Store complete payment response data
    },
    
    // Shipping information
    address: {
        street: {type: String},
        city: {type: String, required: true},
        country: {type: String, required: true},
        zipCode: {type: String},
        phone: {type: String}
    },
    
    // Order status and tracking
    status: {
        type: String, 
        enum: ["pending", "processing", "shipped", "delivered", "cancelled", "refunded"],
        default: "pending"
    },
    statusHistory: [{
        status: String,
        timestamp: {type: Date, default: Date.now},
        note: String
    }],
    trackingNumber: String,
    shippingCarrier: String,
    
    // Customer notes and metadata
    notes: String,
    metadata: {type: Object, default: {}}
}, 
{timestamps: true});



module.exports = mongoose.model("Order", OrderSchema);