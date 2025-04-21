const router = require('express').Router();
const promoCodeController = require('../controllers/promoController');

console.log('🚀 Promo code routes initialization started');

// Middleware to validate MongoDB ObjectID
const validateObjectId = (req, res, next) => {
    const id = req.params.id;
    if (id && !mongoose.Types.ObjectId.isValid(id)) {
        console.log(`❌ Invalid ObjectID format: ${id}`);
        return res.status(400).json({ message: "Invalid ID format" });
    }
    next();
};

// Admin routes - CRUD operations for promo codes
router.post('/', promoCodeController.createPromoCode);
router.get('/', promoCodeController.getAllPromoCodes);
router.get('/:id',validateObjectId, promoCodeController.getPromoCodeById);
router.put('/:id', validateObjectId, promoCodeController.updatePromoCode);
router.delete('/:id', validateObjectId, promoCodeController.deletePromoCode);

// Public routes - For validating and applying promo codes
router.post('/validate', promoCodeController.validatePromoCode);
router.post('/apply', promoCodeController.applyPromoCode);
router.post('/remove',  promoCodeController.removePromoCode);

// Get a promo code by its code value (used by admin)
router.get('/code/:code',  promoCodeController.getPromoCodeByCode);

console.log('✅ Promo code routes registered successfully');

module.exports = router;