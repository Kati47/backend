// Importing required modules and middleware
const router = require('express').Router();
const cartController = require('../controllers/cartController');

console.log('🚀 Cart routes initialization started');

// CREATE Cart: This route is used to create a new cart with complete product information
router.post('/add', cartController.addToCart);

// UPDATE Cart: This route is used to update an existing cart by its ID
router.put('/update/:id', cartController.updateCart);

// DELETE Cart: This route is used to delete a cart by its ID
router.delete('/delete/:id', cartController.deleteCart);

// FIND Cart by userId: This route is used to find a cart by the user's ID
router.get('/find/:userId', cartController.getCartByUserId);

// FIND All Carts: This route is used to find all carts in the database
router.get("/findAll", cartController.getAllCarts);

// DEBUG route: Get cart statistics
router.get("/debug/stats", cartController.getCartStats);

// APPLY PROMO CODE TO CART
router.post('/apply-promo', cartController.applyPromoCode);

// REMOVE PROMO CODE FROM CART
router.post('/remove-promo', cartController.removePromoCode);

// VALIDATE PROMO CODE (without applying it)
router.post('/validate-promo', cartController.validatePromoCode);

console.log('✅ All cart routes registered successfully');

// Export the router so it can be used in other parts of the application
module.exports = router;