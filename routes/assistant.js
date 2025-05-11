const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');
require('dotenv').config();

// Import the geminiApiService with error handling
let geminiApiService;
try {
  geminiApiService = require('../services/geminiApiService');
  logger.info('Gemini API service loaded successfully');
} catch (error) {
  logger.error(`Failed to load Gemini API service: ${error.message}`);
  // Create empty service with dummy functions
  geminiApiService = {
    chat: async () => ({ 
      success: false, 
      response: 'Furniture assistant service is unavailable.' 
    }),
    capabilities: [],
    handleProductSearch: async () => ({}),
    handleRoomDesign: async () => ({}),
    handleBudgetPlanning: async () => ({}),
    handleCareGuide: async () => ({}),
    formatProductForDisplay: () => ({}),
    generateAIResponse: async () => ({})
  };
}

// Destructure the gemini service for easier access
const { 
  chat,
  capabilities: assistantCapabilities,
  handleProductSearch,
  handleRoomDesign,
  handleBudgetPlanning,
  handleCareGuide,
  formatProductForDisplay,
  generateAIResponse,
  genAI
} = geminiApiService;

// Add response formatter with memory handling
function formatResponseForClient(response, stripFormatting = true) {
  // Strip markdown formatting if needed
  if (stripFormatting && response && response.response) {
    response.response = response.response.replace(/\*\*(.*?)\*\*/g, '$1');
  }
  return response;
}

// Add this to your existing functions - a context tracker
let conversationContext = {};
/**
 * Detects budget planning intent from message
 * @param {string} message - The user message to analyze
 * @returns {object|null} Budget intent object or null if not found
 */
function detectBudgetIntent(message) {
  if (!message) return null;
  
  const lowerMessage = message.toLowerCase();
  
  // Look for budget keywords
  const budgetKeywords = [
    'budget', 'afford', 'spend', 'cost', 'price', 'money',
    'dollars', 'bucks', 'cash', 'pay', 'cheap', 'expensive',
    'economical', 'inexpensive', 'pricey', 'affordable'
  ];
  
  const hasBudgetKeyword = budgetKeywords.some(keyword => 
    lowerMessage.includes(keyword)
  );
  
  if (!hasBudgetKeyword) {
    return null;
  }
  
  logger.debug('Budget intent keywords detected');
  
  // Extract budget amount
  const budgetPattern = /\$?(\d{1,3}(?:,\d{3})*|\d+)(?:\s*dollars|\s*bucks)?/i;
  const budgetMatch = lowerMessage.match(budgetPattern);
  
  // Extract room type
  const roomTypes = ['living room', 'bedroom', 'dining room', 'kitchen', 'office', 'bathroom'];
  const roomType = roomTypes.find(room => lowerMessage.includes(room));
  
  if (budgetMatch) {
    // Clean and parse the budget amount
    let budgetAmount = budgetMatch[0].replace(/[^\d]/g, '');
    budgetAmount = parseInt(budgetAmount);
    
    logger.debug(`Budget intent detected: $${budgetAmount} for ${roomType || 'unspecified room'}`);
    
    return {
      budget: budgetAmount,
      roomType: roomType
    };
  }
  
  // If we found budget keywords but no specific amount
  logger.debug('Budget intent detected but no amount specified');
  return {
    budget: null,
    roomType: roomType,
    needsBudgetAmount: true
  };
}
/**
 * @route POST /api/assistant/chat
 * @desc Chat with the furniture assistant
 * @access Public
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, history, sessionId = 'default' } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }
    
    logger.info(`Chat request received: "${message.substring(0, 50)}..."`);
    logger.debug(`Chat history received with ${history?.length || 0} messages`);
    
    // Initialize session context if needed
    if (!conversationContext[sessionId]) {
      conversationContext[sessionId] = {
        budget: null,
        roomType: null,
        lastProducts: [],
        lastQuery: null
      };
    }
    
    // Update context from history
    updateContextFromHistory(history, sessionId);
    
    // Look for direct category + budget requests (e.g., "a bed for 200 dollars")
    const directCategoryAndBudget = extractCategoryAndBudget(message);
    if (directCategoryAndBudget && directCategoryAndBudget.category && directCategoryAndBudget.budget) {
      logger.info(`Direct category+budget request detected: ${directCategoryAndBudget.category} for $${directCategoryAndBudget.budget}`);
      
      // Update context
      conversationContext[sessionId].budget = directCategoryAndBudget.budget;
      conversationContext[sessionId].lastQuery = directCategoryAndBudget.category;
      
      const response = await handleCategoryWithBudget(
        directCategoryAndBudget.category,
        directCategoryAndBudget.budget
      );
      
      return res.json({
        success: true,
        data: formatResponseForClient(response)
      });
    }
    
    // Check for budget-related follow-up
    const budgetIntent = detectBudgetIntent(message);
    if (budgetIntent) {
      logger.info(`Budget intent detected: ${JSON.stringify(budgetIntent)}`);
      
      // Update context with new budget information
      if (budgetIntent.budget) {
        conversationContext[sessionId].budget = budgetIntent.budget;
      }
      
      // Update context with room type if provided
      if (budgetIntent.roomType) {
        conversationContext[sessionId].roomType = budgetIntent.roomType;
      }
      
      // If we have both budget and room type, handle budget planning
      if (conversationContext[sessionId].budget && conversationContext[sessionId].roomType) {
        const response = await handleBudgetPlanning({
          budget: conversationContext[sessionId].budget,
          roomType: conversationContext[sessionId].roomType
        }, message);
        
        return res.json({
          success: true,
          data: formatResponseForClient(response)
        });
      }
      
      // If we have budget but no room type, ask for room type
      if (conversationContext[sessionId].budget && !conversationContext[sessionId].roomType) {
        return res.json({
          success: true,
          data: formatResponseForClient({
            success: true,
            response: `I can help you plan with your $${conversationContext[sessionId].budget} budget. Which room are you furnishing?`,
            needsRoomType: true,
            budget: conversationContext[sessionId].budget
          })
        });
      }
    }
    
    // Check if the user is asking for recommendations with existing budget
    if (isSuggestionRequest(message) && conversationContext[sessionId].budget) {
      logger.info(`Suggestion request detected with budget: $${conversationContext[sessionId].budget}`);
      
      // Get affordable products
      const products = await getProductsWithinBudget(
        conversationContext[sessionId].budget,
        conversationContext[sessionId].lastQuery || 'furniture'
      );
      
      const response = formatAffordableProducts(products, conversationContext[sessionId].budget);
      
      return res.json({
        success: true,
        data: formatResponseForClient(response)
      });
    }
    
    // Check if we're continuing a budget conversation - room type provided after budget
    const isRoomTypeResponse = isProvidingRoomType(message);
    if (conversationContext[sessionId].budget && isRoomTypeResponse) {
      logger.info(`Room type detected in follow-up: ${isRoomTypeResponse}`);
      
      conversationContext[sessionId].roomType = isRoomTypeResponse;
      
      const response = await handleBudgetPlanning({
        budget: conversationContext[sessionId].budget,
        roomType: conversationContext[sessionId].roomType
      }, message);
      
      return res.json({
        success: true,
        data: formatResponseForClient(response)
      });
    }
    
    // Check for product-specific follow-up questions
    if (history && history.length > 0) {
      const lastBotMessage = history.findLast(msg => msg.role === 'assistant');
      const isProductDetailRequest = isAskingAboutSpecificProduct(message, lastBotMessage);
      
      if (isProductDetailRequest) {
        logger.info(`Detected product detail request for: ${isProductDetailRequest.productName}`);
        
        // Get product details
        const productDetails = await getProductDetails(isProductDetailRequest.productName);
        
        if (productDetails) {
          // Update context with selected product
          conversationContext[sessionId].lastSelectedProduct = productDetails;
          
          const detailedResponse = {
            success: true,
            response: formatProductDetails(productDetails),
            product: productDetails
          };
          
          return res.json({
            success: true,
            data: formatResponseForClient(detailedResponse)
          });
        }
      }
      
      // Check for budget constraint follow-up
      const isBudgetConstraint = isAskingForBudgetOptions(message, lastBotMessage);
      if (isBudgetConstraint && isBudgetConstraint.budget) {
        logger.info(`Budget constraint follow-up detected: $${isBudgetConstraint.budget}`);
        
        // Update context
        conversationContext[sessionId].budget = isBudgetConstraint.budget;
        
        // Get products within budget
        const affordableProducts = await getProductsWithinBudget(
          isBudgetConstraint.budget,
          conversationContext[sessionId].lastQuery || 'furniture'
        );
        
        const response = formatAffordableProducts(affordableProducts, isBudgetConstraint.budget);
        return res.json({
          success: true,
          data: formatResponseForClient(response)
        });
      }
    }
    
    // Process regular chat
    const response = await chat(message, history || []);
    
    // Store the query for context
    if (response.searchIntent) {
      conversationContext[sessionId].lastQuery = response.searchIntent.category;
    }
    
    // Store returned products in context
    if (response.products) {
      conversationContext[sessionId].lastProducts = response.products;
    }
    
    return res.json({
      success: true,
      data: formatResponseForClient(response)
    });
  } catch (error) {
    logger.error(`Error in chat endpoint: ${error.message}`, error);
    
    res.status(500).json({
      success: false,
      message: 'An error occurred while processing your message'
    });
  }
});

/**
 * Extracts category and budget from a direct request
 * Example: "Show me beds for $200" or "I want a table for 150 dollars"
 */
function extractCategoryAndBudget(message) {
  if (!message) return null;
  
  const lowerMessage = message.toLowerCase();
  
  // Common furniture categories
  const categories = [
    'sofa', 'couch', 'chair', 'table', 'bed', 'dresser', 'desk',
    'bookcase', 'shelf', 'cabinet', 'lamp', 'rug', 'mattress',
    'nightstand', 'ottoman', 'stool', 'bench', 'mirror', 'wardrobe'
  ];
  
  // Check for furniture category
  let category = null;
  for (const cat of categories) {
    if (lowerMessage.includes(cat)) {
      category = cat;
      break;
    }
  }
  
  // Extract budget amount
  const budgetPattern = /\$?(\d+)(?:\s*dollars|\s*bucks)?/;
  const budgetMatch = lowerMessage.match(budgetPattern);
  
  // If we found both category and budget
  if (category && budgetMatch && budgetMatch[1]) {
    return {
      category: category,
      budget: parseInt(budgetMatch[1])
    };
  }
  
  return null;
}

/**
 * Detects if a message is asking for recommendations or suggestions
 */
function isSuggestionRequest(message) {
  if (!message) return false;
  
  const lowerMessage = message.toLowerCase();
  const suggestionKeywords = [
    'recommend', 'suggestion', 'what can i buy', 'what can i get',
    'show me', 'give me something', 'what do you recommend', 'what should i get',
    'what could i buy', 'suggest', 'options', 'alternatives', 'ideas'
  ];
  
  return suggestionKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Updates conversation context from history
 */
function updateContextFromHistory(history, sessionId) {
  if (!history || !history.length) return;
  
  try {
    // Look for budget mentions in history
    for (const msg of history) {
      if (msg.role === 'assistant' && msg.parts && msg.parts[0] && msg.parts[0].text) {
        const text = msg.parts[0].text;
        
        // Check for budget confirmation in assistant messages
        const budgetMatch = text.match(/with your \$(\d+) budget/i);
        if (budgetMatch && budgetMatch[1]) {
          conversationContext[sessionId].budget = parseInt(budgetMatch[1]);
          logger.debug(`Extracted budget from history: $${conversationContext[sessionId].budget}`);
        }
        
        // Extract room type if present
        const roomTypes = ['living room', 'bedroom', 'dining room', 'kitchen', 'office', 'bathroom'];
        for (const room of roomTypes) {
          if (text.toLowerCase().includes(room)) {
            conversationContext[sessionId].roomType = room;
            logger.debug(`Extracted room type from history: ${room}`);
            break;
          }
        }
      }
    }
  } catch (error) {
    logger.error(`Error updating context from history: ${error.message}`);
  }
}

/**
 * Detects if message is providing a room type in response to budget question
 */
function isProvidingRoomType(message) {
  if (!message) return null;
  
  const lowerMessage = message.toLowerCase();
  const roomTypes = {
    'living room': ['living room', 'living area', 'lounge', 'family room'],
    'bedroom': ['bedroom', 'bed room', 'master bedroom', 'guest room'],
    'dining room': ['dining room', 'dining area', 'dining space'],
    'kitchen': ['kitchen', 'kitchenette'],
    'office': ['office', 'home office', 'study', 'workspace'],
    'bathroom': ['bathroom', 'bath', 'restroom']
  };
  
  // Check each room type for a match
  for (const [roomType, keywords] of Object.entries(roomTypes)) {
    if (keywords.some(keyword => lowerMessage.includes(keyword))) {
      return roomType;
    }
  }
  
  // Check if message is just the room type by itself
  const allRoomKeywords = Object.values(roomTypes).flat();
  for (const keyword of allRoomKeywords) {
    if (lowerMessage === keyword) {
      // Find the corresponding room type
      for (const [roomType, keywords] of Object.entries(roomTypes)) {
        if (keywords.includes(keyword)) {
          return roomType;
        }
      }
    }
  }
  
  return null;
}

/**
 * Detects if message is asking for products within budget
 */
function isAskingForBudgetOptions(message, lastBotMessage) {
  if (!message || !lastBotMessage) return null;
  
  const lowerMessage = message.toLowerCase();
  
  // Budget constraint keywords
  const budgetKeywords = [
    'within my budget', 'in my budget', 'afford', 'cheaper',
    'less expensive', 'lower price', 'lower cost', 'budget of',
    'can\'t afford', 'too expensive', 'too much', 'cheaper options',
    'budget', 'cheaper', 'less'
  ];
  
  const hasBudgetConstraint = budgetKeywords.some(keyword => 
    lowerMessage.includes(keyword)
  );
  
  if (!hasBudgetConstraint) return null;
  
  // Try to extract budget amount from current message
  const budgetMatch = lowerMessage.match(/\$?(\d+)(?:\s*dollars|\s*bucks)?/);
  if (budgetMatch && budgetMatch[1]) {
    return { budget: parseInt(budgetMatch[1]) };
  }
  
  // Check for a previously mentioned budget
  for (const sessionId in conversationContext) {
    if (conversationContext[sessionId].budget) {
      return { budget: conversationContext[sessionId].budget };
    }
  }
  
  return { budget: null, needsBudgetAmount: true };
}

/**
 * Gets products within specified budget
 */
async function getProductsWithinBudget(budget, category = 'furniture') {
  try {
    logger.info(`Getting products within budget $${budget} for category ${category}`);
    
    const query = {
      inStock: true,
      price: { $lte: budget }
    };
    
    // Add category filter
    if (category && category !== 'furniture') {
      query.$or = [
        { categories: category },
        { title: { $regex: new RegExp(category, 'i') } },
        { desc: { $regex: new RegExp(category, 'i') } }
      ];
    }
    
    const products = await geminiApiService.Product.find(query)
      .sort({ price: -1 })  // Sort by price descending (get the best quality)
      .limit(3);
    
    return products.map(p => geminiApiService.formatProductForDisplay(p));
  } catch (error) {
    logger.error(`Error getting budget products: ${error.message}`, error);
    return [];
  }
}

/**
 * Formats affordable products into a response
 */
function formatAffordableProducts(products, budget) {
  let responseText = `Here are some options within your $${budget} budget:\n\n`;
  
  products.forEach((product, index) => {
    responseText += `${index + 1}. ${product.title} - $${product.price}\n`;
    responseText += `   ${product.color}, ${product.size || 'Standard size'}\n`;
    responseText += `   ${product.description.substring(0, 100)}...\n\n`;
  });
  
  responseText += `These options fit nicely within your $${budget} budget. Would you like more details about any of these items?`;
  
  return {
    success: true,
    response: responseText,
    products: products,
    budget: budget
  };
}

/**
 * Detects if a message is asking about a specific product from previous response
 */
function isAskingAboutSpecificProduct(message, lastBotMessage) {
  if (!message || !lastBotMessage || !lastBotMessage.parts) return null;
  
  // Convert to lowercase for easier matching
  const lowerMessage = message.toLowerCase();
  const lastResponse = lastBotMessage.parts[0]?.text || '';
  
  // Product interest indicators
  const interestKeywords = [
    'like', 'interested', 'tell me more', 'more about', 'details', 
    'want', 'choose', 'pick', 'select', 'buy', 'purchase'
  ];
  
  // Check if message contains interest keywords
  const hasInterestKeyword = interestKeywords.some(keyword => 
    lowerMessage.includes(keyword)
  );
  
  if (!hasInterestKeyword) return null;
  
  // Get product names from last bot message
  const productNamesRegex = /\d+\.\s+([^-]+)\s+-\s+\$/g;
  const productMatches = [...lastResponse.matchAll(productNamesRegex)];
  const productNames = productMatches.map(match => match[1].trim());
  
  // Check if message mentions any of the product names
  for (const productName of productNames) {
    if (lowerMessage.includes(productName.toLowerCase())) {
      return { productName };
    }
    
    // Check for product number mention (e.g., "the first one", "number 2")
    const numberWords = ['first', 'second', 'third', 'fourth', 'fifth', '1', '2', '3', '4', '5'];
    const numberMatch = numberWords.findIndex(word => lowerMessage.includes(word));
    
    if (numberMatch !== -1) {
      const productIndex = numberMatch % 5; // Convert to 0-based index
      if (productNames[productIndex]) {
        return { productName: productNames[productIndex] };
      }
    }
  }
  
  return null;
}

/**
 * Gets detailed information about a specific product
 */
async function getProductDetails(productName) {
  try {
    logger.info(`Fetching product details for: ${productName}`);
    
    // Query the database for the product
    const product = await geminiApiService.Product.findOne({
      title: { $regex: new RegExp(productName, 'i') }
    });
    
    if (!product) {
      logger.warn(`Product not found: ${productName}`);
      return null;
    }
    
    // Return formatted product
    return geminiApiService.formatProductForDisplay(product);
  } catch (error) {
    logger.error(`Error getting product details: ${error.message}`, error);
    return null;
  }
}

/**
 * Formats detailed product information for display
 */
function formatProductDetails(product) {
  return `
Here are the detailed specifications for the ${product.title}:

PRICE: $${product.price}

COLOR: ${product.color}

SIZE: ${product.size || 'Standard'}

DIMENSIONS: ${product.dimensions || 'Not specified'}

DESCRIPTION:
${product.description}

FEATURES:
- ${product.inStock ? 'In stock and ready to ship' : 'Currently out of stock'}
- ${product.categories.join(', ')}
${product.rating ? `- Customer Rating: ${product.rating}/5` : ''}

Would you like to see any other products or have questions about purchasing this item?
  `;
}

/**
 * @route GET /api/assistant/capabilities
 * @desc Get assistant capabilities
 * @access Public
 */
router.get('/capabilities', (req, res) => {
  logger.info('Capabilities request received');
  
  res.json({
    success: true,
    data: {
      capabilities: assistantCapabilities
    }
  });
});

/**
 * @route GET /api/assistant/test
 * @desc Test the Gemini API connection
 * @access Public
 */
router.get('/test', async (req, res) => {
  logger.info('Received test request');
  try {
    if (!genAI) {
      logger.error('Gemini API not initialized');
      return res.status(500).json({
        success: false,
        message: "Gemini API not initialized - check API key"
      });
    }
    
    logger.info('Creating model for test...');
    const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });
    
    logger.info('Sending test prompt to Gemini...');
    const prompt = "Hello, give me a brief greeting as a friendly furniture store assistant.";
    const result = await model.generateContent(prompt);
    
    logger.info('Processing test response...');
    const response = await result.response;
    const text = response.text();
    
    logger.info(`Test successful - received ${text.length} character response`);
    return res.status(200).json({
      success: true,
      message: "Gemini API is working!",
      response: text
    });
  } catch (error) {
    logger.error(`Test endpoint error: ${error.message}`, error);
    return res.status(500).json({
      success: false,
      message: "Failed to connect to Gemini API",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * @route POST /api/assistant/room-suggestions
 * @desc Get furniture suggestions for a room
 * @access Public
 */
router.post('/room-suggestions', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Room description is required'
      });
    }
    
    const response = await handleRoomDesign(message, []);
    
    return res.json({
      success: true,
      data: response
    });
  } catch (error) {
    logger.error(`Error in room suggestions endpoint: ${error.message}`, error);
    
    res.status(500).json({
      success: false,
      message: 'An error occurred while processing your room request'
    });
  }
});

/**
 * @route POST /api/assistant/care-guide
 * @desc Get care instructions for furniture
 * @access Public
 */
router.post('/care-guide', async (req, res) => {
  try {
    const { material, furnitureType } = req.body;
    
    if (!material || !furnitureType) {
      return res.status(400).json({
        success: false,
        message: 'Material and furniture type are required'
      });
    }
    
    const response = await handleCareGuide({ material, furnitureType });
    
    return res.json({
      success: true,
      data: response
    });
  } catch (error) {
    logger.error(`Error in care guide endpoint: ${error.message}`, error);
    
    res.status(500).json({
      success: false,
      message: 'An error occurred while generating care instructions'
    });
  }
});

/**
 * @route POST /api/assistant/budget-recommendations
 * @desc Get furniture recommendations within a budget
 * @access Public
 */
router.post('/budget-recommendations', async (req, res) => {
  try {
    const { budget, roomType } = req.body;
    
    if (!budget || !roomType) {
      return res.status(400).json({
        success: false,
        message: 'Budget amount and room type are required'
      });
    }
    
    const response = await handleBudgetPlanning({ budget, roomType });
    
    return res.json({
      success: true,
      data: response
    });
  } catch (error) {
    logger.error(`Error in budget planning endpoint: ${error.message}`, error);
    
    res.status(500).json({
      success: false,
      message: 'An error occurred while creating your budget plan'
    });
  }
});

/**
 * @route GET /api/assistant/list-models
 * @desc List available Gemini AI models
 * @access Public
 */
router.get('/list-models', async (req, res) => {
  try {
    if (!genAI) {
      return res.status(500).json({
        success: false,
        message: "Gemini API not initialized - check API key"
      });
    }
    
    const models = await genAI.listModels();
    
    return res.json({
      success: true,
      data: {
        models: models.models
      }
    });
  } catch (error) {
    logger.error(`Error listing models: ${error.message}`, error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve model list from Gemini API'
    });
  }
});

module.exports = router;