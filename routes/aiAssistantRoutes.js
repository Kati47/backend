const express = require('express');
const router = express.Router();
const { aiAssistant, capabilities } = require('../services/aiAssistantService');
const logger = require('../utils/logger');

/**
 * @api {post} /api/ai Universal AI assistant endpoint
 * @apiName AIAssistant
 * @apiGroup AI
 * @apiDescription Universal endpoint for all AI assistant functionality
 * 
 * @apiParam {String} action Type of action (chat, search, recommendations, popular, extract-preferences, room-suggestions, capabilities)
 * @apiParam {String} [message] User's message (required for chat and extract-preferences)
 * @apiParam {Object} [preferences] Specific furniture preferences
 * @apiParam {String} [category] Category filter (for popular action)
 * @apiParam {Array} [conversationHistory] Previous conversation messages
 * 
 * @apiSuccess {Boolean} success Request success status
 * @apiSuccess {Object} data Response data specific to the requested action
 */
router.post('/', async (req, res) => {
  try {
    const { 
      action = 'chat', 
      message, 
      preferences, 
      category, 
      conversationHistory 
    } = req.body;
    
    // Get userId from authenticated user if available
    const userId = req.user?._id;
    
    logger.info(`AI assistant request: ${action}`);
    
    // Call the unified AI assistant function
    const result = await aiAssistant({
      message,
      preferences,
      action,
      category,
      conversationHistory,
      userId
    });
    
    res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    logger.error(`Error in AI assistant: ${error.message}`, error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while processing your request',
      error: error.message
    });
  }
});

// For backward compatibility and simple access, you can keep these explicit routes
router.get('/capabilities', (req, res) => {
  res.status(200).json({
    success: true,
    capabilities
  });
});
// Add these diagnostic endpoints

// Simple test endpoint to verify connection
router.get('/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'AI assistant endpoint is working correctly',
    timestamp: new Date().toISOString()
  });
});

// More detailed status endpoint
router.get('/status', (req, res) => {
  // Check if the Gemini API key is configured
  const hasApiKey = process.env.GEMINI_API_KEY ? true : false;
  
  res.status(200).json({
    success: true,
    service: 'AI Assistant',
    status: 'running',
    aiModelAvailable: hasApiKey,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});
module.exports = router;