const express = require('express');
const router = express.Router();
const geminiApiService = require('../services/geminiApiService');
const logger = require('../utils/logger');

/**
 * @api {get} /api/chatbot/capabilities Get chatbot capabilities
 * @apiName GetChatbotCapabilities
 * @apiGroup Chatbot
 * @apiSuccess {Array} capabilities List of assistant capabilities
 */
router.get('/capabilities', (req, res) => {
  try {
    res.status(200).json({
      success: true,
      capabilities: geminiApiService.capabilities
    });
  } catch (error) {
    logger.error(`Error fetching capabilities: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chatbot capabilities'
    });
  }
});

/**
 * @api {post} /api/chatbot/message Send message to chatbot
 * @apiName SendMessage
 * @apiGroup Chatbot
 * @apiParam {String} message User's message text
 * @apiParam {Array} [conversationHistory] Previous conversation messages
 * @apiParam {Object} [contextData] Additional context data
 * @apiSuccess {Boolean} success Request success status
 * @apiSuccess {String} response AI generated response text
 * @apiSuccess {Array} products Matched or recommended furniture products
 * @apiSuccess {String} intent Detected user intent
 * @apiSuccess {Object} preferences Extracted user preferences
 * @apiSuccess {Object} filterOptions Available filter options
 */
router.post('/message', async (req, res) => {
  try {
    const { message, conversationHistory = [], contextData = {} } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }
    
   
    
    const response = await geminiApiService.processMessage(
      message, 
      conversationHistory,
      contextData
    );
    
    res.status(response.success ? 200 : 500).json(response);
  } catch (error) {
    logger.error(`Error processing chatbot message: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to process message',
      error: error.message
    });
  }
});

/**
 * @api {post} /api/chatbot/search Search furniture
 * @apiName SearchFurniture
 * @apiGroup Chatbot
 * @apiParam {Object} preferences Search preferences
 * @apiSuccess {Boolean} success Request success status
 * @apiSuccess {Array} products Search results
 * @apiSuccess {Object} filterOptions Available filter options
 */
router.post('/search', async (req, res) => {
  try {
    const { preferences = {} } = req.body;
    
    const products = await geminiApiService.searchFurniture(preferences);
    const filterOptions = geminiApiService.generateFilterOptions(products);
    
    res.status(200).json({
      success: true,
      products: products.map(geminiApiService.formatProduct),
      filterOptions
    });
  } catch (error) {
    logger.error(`Error in furniture search: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to search furniture',
      error: error.message
    });
  }
});

/**
 * @api {get} /api/chatbot/recommendations Get furniture recommendations
 * @apiName GetRecommendations
 * @apiGroup Chatbot
 * @apiParam {Object} preferences Furniture preferences
 * @apiSuccess {Boolean} success Request success status
 * @apiSuccess {Array} products Recommended furniture
 */
router.get('/recommendations', async (req, res) => {
  try {
    const preferences = req.query;
    const userId = req.user?._id;
    
    const recommendations = await geminiApiService.getFurnitureRecommendations(
      preferences,
      userId
    );
    
    res.status(200).json({
      success: true,
      products: recommendations.map(geminiApiService.formatProduct)
    });
  } catch (error) {
    logger.error(`Error getting furniture recommendations: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to get furniture recommendations',
      error: error.message
    });
  }
});

/**
 * @api {get} /api/chatbot/popular Get popular furniture
 * @apiName GetPopularFurniture
 * @apiGroup Chatbot
 * @apiParam {String} [category] Optional category filter
 * @apiSuccess {Boolean} success Request success status
 * @apiSuccess {Array} products Popular furniture
 */
router.get('/popular', async (req, res) => {
  try {
    const { category } = req.query;
    
    const popularFurniture = await geminiApiService.getPopularFurniture(category);
    
    res.status(200).json({
      success: true,
      products: popularFurniture.map(geminiApiService.formatProduct)
    });
  } catch (error) {
    logger.error(`Error getting popular furniture: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to get popular furniture',
      error: error.message
    });
  }
});

/**
 * @api {post} /api/chatbot/filter Filter and sort furniture
 * @apiName FilterFurniture
 * @apiGroup Chatbot
 * @apiParam {Object} preferences Filter and sort preferences
 * @apiSuccess {Boolean} success Request success status
 * @apiSuccess {Array} products Filtered furniture
 * @apiSuccess {Object} filterOptions Available filter options
 */
router.post('/filter', async (req, res) => {
  try {
    const { preferences = {} } = req.body;
    
    const filteredFurniture = await geminiApiService.filterAndSortFurniture(preferences);
    const filterOptions = geminiApiService.generateFilterOptions(filteredFurniture);
    
    res.status(200).json({
      success: true,
      products: filteredFurniture.map(geminiApiService.formatProduct),
      filterOptions
    });
  } catch (error) {
    logger.error(`Error filtering furniture: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to filter furniture',
      error: error.message
    });
  }
});

/**
 * @api {post} /api/chatbot/extract-preferences Extract furniture preferences
 * @apiName ExtractPreferences
 * @apiGroup Chatbot
 * @apiParam {String} message User's message text
 * @apiSuccess {Boolean} success Request success status
 * @apiSuccess {Object} preferences Extracted furniture preferences
 */
router.post('/extract-preferences', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }
    
    const preferences = await geminiApiService.extractFurniturePreferences(message);
    
    res.status(200).json({
      success: true,
      preferences
    });
  } catch (error) {
    logger.error(`Error extracting furniture preferences: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to extract furniture preferences',
      error: error.message
    });
  }
});

/**
 * @api {get} /api/chatbot/compare Compare furniture items
 * @apiName CompareFurniture
 * @apiGroup Chatbot
 * @apiParam {Array} productIds IDs of furniture to compare
 * @apiSuccess {Boolean} success Request success status
 * @apiSuccess {Object} comparison Comparison results
 */
router.get('/compare', async (req, res) => {
  try {
    const productIds = req.query.ids?.split(',') || [];
    
    if (productIds.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'At least two product IDs are required for comparison'
      });
    }
    
    // Get products by IDs
    const products = await Product.find({
      _id: { $in: productIds },
      inStock: true
    });
    
    if (products.length < 2) {
      return res.status(404).json({
        success: false,
        message: 'Not enough valid products found for comparison'
      });
    }
    
    // Format products for response
    const formattedProducts = products.map(geminiApiService.formatProduct);
    
    // Get comparison attributes
    const attributes = ['price', 'material', 'style', 'color', 'rating'];
    
    // Create comparison object
    const comparison = {
      products: formattedProducts,
      attributes: {}
    };
    
    // For each attribute, find min, max, and differences
    attributes.forEach(attr => {
      if (attr === 'price' || attr === 'rating') {
        const values = formattedProducts.map(p => p[attr] || 0);
        comparison.attributes[attr] = {
          min: Math.min(...values),
          max: Math.max(...values),
          difference: Math.max(...values) - Math.min(...values)
        };
      } else {
        const values = formattedProducts.map(p => p[attr] || '');
        comparison.attributes[attr] = {
          values: [...new Set(values)],
          isSame: new Set(values).size === 1
        };
      }
    });
    
    res.status(200).json({
      success: true,
      comparison
    });
  } catch (error) {
    logger.error(`Error comparing furniture: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to compare furniture',
      error: error.message
    });
  }
});

/**
 * @api {get} /api/chatbot/room-suggestions Get room-based furniture suggestions
 * @apiName GetRoomSuggestions
 * @apiGroup Chatbot
 * @apiParam {String} room Room type
 * @apiParam {String} [style] Optional style preference
 * @apiSuccess {Boolean} success Request success status
 * @apiSuccess {Object} suggestions Room furniture suggestions
 */
router.get('/room-suggestions', async (req, res) => {
  try {
    const { room, style } = req.query;
    
    if (!room) {
      return res.status(400).json({
        success: false,
        message: 'Room type is required'
      });
    }
    
    // Define essential furniture for different room types
    const roomEssentials = {
      'living room': ['sofa', 'coffee table', 'side table', 'tv stand', 'bookcase'],
      'bedroom': ['bed', 'nightstand', 'dresser', 'wardrobe'],
      'dining room': ['dining table', 'dining chair', 'buffet', 'china cabinet'],
      'office': ['desk', 'office chair', 'bookcase', 'file cabinet'],
      'kitchen': ['kitchen table', 'bar stool', 'kitchen island', 'cabinet'],
      'bathroom': ['vanity', 'cabinet', 'shelf', 'storage'],
      'entryway': ['console table', 'bench', 'coat rack', 'shoe rack']
    };
    
    const essentials = roomEssentials[room.toLowerCase()] || [];
    
    if (essentials.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid room type'
      });
    }
    
    // Initialize results object
    const suggestions = {
      room,
      style: style || null,
      essentialPieces: essentials,
      suggestedFurniture: {}
    };
    
    // For each essential furniture type, find matching items
    for (const furnitureType of essentials) {
      const preferences = {
        category: furnitureType,
        room: room,
        style: style || null
      };
      
      const matches = await geminiApiService.searchFurniture(preferences);
      suggestions.suggestedFurniture[furnitureType] = matches
        .slice(0, 3)
        .map(geminiApiService.formatProduct);
    }
    
    res.status(200).json({
      success: true,
      suggestions
    });
  } catch (error) {
    logger.error(`Error getting room suggestions: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to get room suggestions',
      error: error.message
    });
  }
});

module.exports = router;