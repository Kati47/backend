const router = require('express').Router();
const reviewController = require('../controllers/reviewController');

console.log('⭐ Review routes initialization started');

// Create a new review
router.post('/', reviewController.createReview);

// Get all reviews for a product
router.get('/product/:productId', reviewController.getProductReviews);

// Get all reviews by a user
router.get('/user/:userId', reviewController.getUserReviews);

// Update a review
router.put('/:id', reviewController.updateReview);

// Delete a review
router.delete('/:id', reviewController.deleteReview);


console.log('✅ All review routes registered successfully');

module.exports = router;