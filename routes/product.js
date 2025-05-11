const router = require('express').Router();
const productController = require('../controllers/productController');
const { validateObjectId } = require('../controllers/productController');

console.log('🚀 Product routes initialization started');

// CREATE PRODUCT
router.post('/addProduct', productController.createProduct);

// UPDATE PRODUCT
router.put('/update/:id', validateObjectId, productController.updateProduct);

// Compare products (fixed route)
router.post('/compare', productController.compareProducts);

// Get comparison options for a specific product
router.get('/:id/comparison-options', validateObjectId, productController.getComparisonOptions);

// DELETE PRODUCT
router.delete('/delete/:id', validateObjectId, productController.deleteProduct);

// GET PRODUCT BY ID (WITH FAVORITE/SAVED STATUS)
router.get('/find/:id', validateObjectId, productController.getProductById);

// GET ALL PRODUCTS (WITH FILTERING)
router.get('/', productController.getAllProducts);

// TOGGLE FAVORITE STATUS
router.post('/favorite/toggle', productController.toggleFavorite);

// TOGGLE SAVED FOR LATER STATUS
router.post('/savedforlater/toggle', productController.toggleSavedForLater);

// GET USER'S FAVORITE PRODUCTS
router.get('/favorites/:userId', productController.getUserFavorites);

// GET USER'S SAVED FOR LATER PRODUCTS
router.get('/savedforlater/:userId', productController.getUserSavedProducts);

// ADD TO SAVED FOR LATER FROM CART (HELPER ROUTE)
router.post('/move-to-saved', productController.moveToSaved);

// Update route to use the new unified recommendation function
router.get('/recommendations', productController.getProductRecommendations);
router.post('/recommendations', productController.getProductRecommendations);

// Keep the old routes for backward compatibility
router.get('/furniture-recommendations', productController.getProductRecommendations);
router.post('/room-design-recommendations', productController.getProductRecommendations);

// DEBUG ROUTE
router.get('/debug', productController.debugInfo);

console.log('✅ All product routes registered successfully');

module.exports = router;