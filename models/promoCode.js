const mongoose = require('mongoose');

console.log('📦 Initializing Promo Code model');

const promoCodeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    type: {
        type: String,
        enum: ['percentage', 'fixed_amount', 'free_shipping', 'buy_x_get_y'],
        required: true
    },
    value: {
        type: Number,
        required: function() {
            // Required for percentage and fixed_amount types
            return ['percentage', 'fixed_amount', 'buy_x_get_y'].includes(this.type);
        },
        min: 0,
        validate: {
            validator: function(v) {
                // Percentage must be <= 100
                if (this.type === 'percentage' && v > 100) {
                    return false;
                }
                return true;
            },
            message: props => `${props.value} is not a valid value for ${props.type} type!`
        }
    },
    minOrderValue: {
        type: Number,
        default: 0,
        min: 0
    },
    maxDiscount: {
        type: Number,
        min: 0,
        default: null
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date,
        required: true,
        validate: {
            validator: function(v) {
                return v > this.startDate;
            },
            message: 'End date must be after start date!'
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    usageLimit: {
        type: Number,
        default: null, // null means unlimited
        min: 0
    },
    userUsageLimit: {
        type: Number,
        default: null, // null means unlimited
        min: 0
    },
    currentUsage: {
        type: Number,
        default: 0,
        min: 0
    },
    userUsage: [
        {
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true
            },
            usageCount: {
                type: Number,
                default: 1,
                min: 0
            },
            lastUsed: {
                type: Date,
                default: Date.now
            }
        }
    ],
    applicableProducts: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product'
        }
    ],
    applicableCategories: [String],
    excludedProducts: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product'
        }
    ],
    excludedCategories: [String],
    firstTimeOnly: {
        type: Boolean,
        default: false
    },
    description: {
        type: String,
        trim: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

// Virtual property to check if promo is expired
promoCodeSchema.virtual('isExpired').get(function() {
    return new Date() > this.endDate;
});

// Virtual property to check if promo is active and not expired
promoCodeSchema.virtual('isValid').get(function() {
    const now = new Date();
    return this.isActive && now >= this.startDate && now <= this.endDate;
});

// Virtual property to check if usage limit is reached
promoCodeSchema.virtual('isUsageLimitReached').get(function() {
    if (this.usageLimit === null) return false;
    return this.currentUsage >= this.usageLimit;
});

// Add pre-save hook to convert code to uppercase
promoCodeSchema.pre('save', function(next) {
    if (this.code) {
        this.code = this.code.toUpperCase();
    }
    next();
});

// Method to check if a user can use this promo code
promoCodeSchema.methods.canBeUsedByUser = function(userId) {
    // If no user usage limit, always allow
    if (this.userUsageLimit === null) return true;
    
    // Find this user in the usage array
    const userUsage = this.userUsage.find(usage => 
        usage.userId.toString() === userId.toString()
    );
    
    // If user hasn't used it yet or is under limit
    return !userUsage || userUsage.usageCount < this.userUsageLimit;
};

// Method to track usage of this promo code
promoCodeSchema.methods.trackUsage = async function(userId) {
    // Increment overall usage
    this.currentUsage += 1;
    
    // Find or create user usage entry
    const userUsageIndex = this.userUsage.findIndex(usage => 
        usage.userId.toString() === userId.toString()
    );
    
    if (userUsageIndex >= 0) {
        // User has used this promo before, increment count
        this.userUsage[userUsageIndex].usageCount += 1;
        this.userUsage[userUsageIndex].lastUsed = new Date();
    } else {
        // First time user is using this promo
        this.userUsage.push({
            userId: userId,
            usageCount: 1,
            lastUsed: new Date()
        });
    }
    
    // Save the updated promo code
    return await this.save();
};

// Calculate discount amount based on promo type and cart value
promoCodeSchema.methods.calculateDiscount = function(cartItems, cartSubtotal) {
    // Check if cart meets minimum order value
    if (cartSubtotal < this.minOrderValue) {
        return {
            discountAmount: 0,
            discountedItems: [],
            message: `Minimum order value of ${this.minOrderValue} not met`
        };
    }
    
    let discountAmount = 0;
    let discountedItems = [];
    let message = '';
    
    // Apply different calculation based on promo type
    switch(this.type) {
        case 'percentage':
            discountAmount = cartSubtotal * (this.value / 100);
            message = `${this.value}% discount applied`;
            
            // Apply max discount cap if specified
            if (this.maxDiscount !== null && discountAmount > this.maxDiscount) {
                discountAmount = this.maxDiscount;
                message += ` (capped at ${this.maxDiscount})`;
            }
            break;
            
        case 'fixed_amount':
            discountAmount = Math.min(this.value, cartSubtotal);
            message = `${this.value} discount applied`;
            break;
            
        case 'free_shipping':
            // This is handled at checkout, not here
            discountAmount = 0;
            message = 'Free shipping applied';
            break;
            
        case 'buy_x_get_y':
            // Implementation for buy X get Y logic would go here
            // This is a simplified version
            message = 'Buy X Get Y applied';
            break;
    }
    
    return {
        discountAmount: parseFloat(discountAmount.toFixed(2)),
        discountedItems,
        message
    };
};

const PromoCode = mongoose.model('PromoCode', promoCodeSchema);

console.log('✅ Promo Code model initialized');

module.exports = PromoCode;