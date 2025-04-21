const mongoose = require('mongoose');

const TokenSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    token: {
        type: String,
        required: true,
        index:true
    },
    revoked: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: '7d' // Auto-delete tokens after 7 days
    }
});

// Index to quickly find tokens by userId and revocation status
TokenSchema.index({ userId: 1, revoked: 1 });

exports.Token = mongoose.model('Token', TokenSchema);