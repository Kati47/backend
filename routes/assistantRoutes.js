const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const assistantService = require('../services/geminiApiService');
const logger = require('../utils/logger');
const Product = require('../models/product');

/**
 * @route   POST /api/assistant/unified
 * @desc    Unified endpoint for all assistant functionality
 * @access  Public
 */
router.post('/unified', [
  check('message', 'Message is required').notEmpty(),
  check('conversationHistory', 'Invalid conversation history').optional().isArray(),
  check('contextData', 'Invalid context data').optional().isObject()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { message, conversationHistory = [], contextData = {} } = req.body;
    logger.info(`Unified assistant request: ${message.substring(0, 30)}...`);
    
    const response = await assistantService.unifiedAssistant(message, conversationHistory, contextData);
    return res.json(response);
  } catch (error) {
    logger.error(`Error in unified assistant endpoint: ${error.message}`, error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error processing your request'
    });
  }
});

/**
 * @route   GET /api/assistant/capabilities
 * @desc    Get list of assistant capabilities
 * @access  Public
 */
router.get('/capabilities', (req, res) => {
  try {
    return res.json({
      success: true,
      capabilities: assistantService.capabilities
    });
  } catch (error) {
    logger.error(`Error getting capabilities: ${error.message}`);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error'
    });
  }
});

/**
 * @route   POST /api/assistant/feedback
 * @desc    Submit user feedback about AI recommendations
 * @access  Private
 */
router.post('/feedback', [
  check('conversationId', 'Conversation ID is required').notEmpty(),
  check('rating', 'Rating must be between 1-5').isInt({ min: 1, max: 5 }),
  check('feedback', 'Feedback is required').optional().isString(),
  check('helpful', 'Helpful flag is required').isBoolean()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { conversationId, rating, feedback, helpful, selectedProducts } = req.body;
    const userId = req.user?.id || 'anonymous';
    
    // Here you would store the feedback in your database
    // This is just a placeholder implementation
    logger.info(`Feedback received from user ${userId} for conversation ${conversationId}: rating=${rating}, helpful=${helpful}`);
    
    return res.json({
      success: true,
      message: 'Feedback submitted successfully'
    });
  } catch (error) {
    logger.error(`Error submitting feedback: ${error.message}`, error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error processing your request'
    });
  }
});

/**
 * @route   POST /api/assistant/product-info
 * @desc    Get detailed information about a product for the assistant
 * @access  Public
 */
router.post('/product-info', [
  check('productId', 'Product ID is required').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { productId } = req.body;
    
    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    return res.json({
      success: true,
      product: assistantService.formatProductForDisplay(product)
    });
  } catch (error) {
    logger.error(`Error getting product info: ${error.message}`, error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error processing your request'
    });
  }
});

/**
 * @route   POST /api/assistant/debug
 * @desc    Debug endpoint to test product search functionality
 * @access  Private (you might want to restrict this in production)
 */
router.post('/debug', async (req, res) => {
  try {
    const { searchTerm, type = 'simple' } = req.body;
    
    if (!searchTerm) {
      return res.status(400).json({
        success: false,
        message: 'Search term is required'
      });
    }
    
    let results;
    
    // Simple query
    if (type === 'simple') {
      results = await Product.find({
        $or: [
          { title: { $regex: new RegExp(searchTerm, 'i') } },
          { categories: { $regex: new RegExp(searchTerm, 'i') } },
          { desc: { $regex: new RegExp(searchTerm, 'i') } }
        ]
      }).limit(10);
    } 
    // AI-assisted query
    else if (type === 'ai') {
      // Extract preferences from the search term using available methods
      const preferences = await assistantService.extractEnhancedUserPreferences(searchTerm, []);
      // Get recommendations based on those preferences using available methods
      const recommendations = await assistantService.getEnhancedRecommendations(preferences, []);
      
      results = {
        extractedPreferences: preferences,
        products: recommendations
      };
    }
    // Show all products of a type
    else if (type === 'productType') {
      results = await Product.find({
        $or: [
          { categories: { $regex: new RegExp(searchTerm, 'i') } },
          { title: { $regex: new RegExp(searchTerm, 'i') } }
        ]
      }).sort({ averageRating: -1 }).limit(20);
    }
    
    return res.json({
      success: true,
      searchTerm,
      results: type === 'ai' ? {
        preferences: results.extractedPreferences,
        products: results.products.map(assistantService.formatProductForDisplay)
      } : results.map(assistantService.formatProductForDisplay)
    });
  } catch (error) {
    logger.error(`Error in debug endpoint: ${error.message}`, error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error processing your debug request'
    });
  }
});

/**
 * @route   POST /api/assistant/reset-context
 * @desc    Reset the context tracker for a fresh conversation
 * @access  Public
 */
router.post('/reset-context', async (req, res) => {
  try {
    // Need to add this function to the service
    await assistantService.resetContext();
    
    return res.json({
      success: true,
      message: 'Conversation context has been reset'
    });
  } catch (error) {
    logger.error(`Error resetting context: ${error.message}`, error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error resetting context'
    });
  }
});

module.exports = router;