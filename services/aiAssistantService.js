const { GoogleGenerativeAI } = require('@google/generative-ai');
const Product = require('../models/product');
const User = require('../models/user');
const logger = require('../utils/logger');

// Configure the Gemini API client
let genAI = null;
try {
  if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    logger.info('Gemini AI client initialized successfully');
  } else {
    logger.warn('No Gemini API key found, AI features will be limited');
  }
} catch (error) {
  logger.error('Failed to initialize Gemini AI client:', error);
}

// Define assistant capabilities
const assistantCapabilities = [
  {
    name: 'product_search',
    description: 'Search for furniture products based on criteria'
  },
  {
    name: 'product_recommendations', 
    description: 'Get personalized furniture recommendations'
  },
  {
    name: 'style_advice',
    description: 'Get interior design and styling advice'
  },
  {
    name: 'price_comparison',
    description: 'Compare furniture prices across different options'
  },
  {
    name: 'room_planning',
    description: 'Get help planning furniture for a specific room'
  }
];

/**
 * Unified AI assistant function that handles various assistant interactions
 * @param {Object} params - Parameters for the assistant
 * @param {string} params.message - User's message
 * @param {Object} params.preferences - User preferences
 * @param {string} params.action - Type of action (chat, search, recommendations, etc.)
 * @param {string} params.category - Product category
 * @param {Array} params.conversationHistory - Previous conversation messages
 * @param {string} params.userId - User ID for personalization
 * @returns {Object} Response object with appropriate data
 */
async function aiAssistant(params = {}) {
  const {
    message,
    preferences = {},
    action = 'chat',
    category = null,
    conversationHistory = [],
    userId = null
  } = params;

  logger.info(`AI Assistant called with action: ${action}`);
  
  try {
    // Return capabilities if requested
    if (action === 'capabilities') {
      return {
        success: true,
        capabilities: assistantCapabilities
      };
    }
    
    // For chat/message flow, process the natural language input
    if (action === 'chat' && message) {
      // Check if this is just a greeting or simple message
      const isSimpleGreeting = isGreeting(message);
      
      // Store the processed conversation for context
      const processedConversation = conversationHistory.slice(-10); // Use just last 10 messages for context
      
      if (isSimpleGreeting && processedConversation.length <= 1) {
        // If this is the first message and it's just a greeting, don't show products yet
        return {
          success: true,
          response: "Hello! I'm your furniture assistant. I can help you find the right pieces for your home. What kind of furniture are you looking for today?",
          intent: "greeting",
          followUpQuestions: [
            "What room are you shopping for?",
            "Do you have a specific budget in mind?",
            "What style of furniture do you prefer?"
          ]
        };
      }
      
      // Get user preferences from history if available
      let userPreferences = {
        ...preferences
      };
      
      // Extract user information if we have a userId
      let userInfo = null;
      if (userId) {
        try {
          const user = await User.findById(userId).lean();
          if (user) {
            userInfo = {
              name: user.name,
              previousPurchases: user.previousPurchases || []
            };
          }
        } catch (err) {
          logger.warn(`Failed to get user info for personalization: ${err.message}`);
        }
      }
      
      // Process the message with AI if we have a Gemini client
      let aiResponse = '';
      let extractedPreferences = {};
      let intent = '';
      
      if (genAI) {
        const model = genAI.getGenerativeModel({ model: 'models/gemini-1.5-flash' });
        
        // Prepare the conversation history for context
        let chatHistory = "";
        if (processedConversation.length > 0) {
          chatHistory = processedConversation.map(msg => 
            `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
          ).join('\n');
        }
        
        // Prepare the prompt for the AI
        const prompt = `
        You are a helpful furniture store assistant. Your goal is to help the customer find furniture they'll love.
        
        ${chatHistory ? `Previous conversation:\n${chatHistory}\n\n` : ''}
        User's current message: ${message}
        
        ${userInfo ? `User information: ${JSON.stringify(userInfo, null, 2)}` : ''}
        
        First, determine what the user needs. Are they looking for a specific type of furniture?
        Do they have preferences about style, budget, materials, or room type?
        
        Respond in a friendly, helpful tone. Don't make up information about products.
        
        If the user is asking a general question, just answer it naturally without suggesting products.
        
        If the user is looking for specific furniture or asking for recommendations, extract these data points:
        - Furniture category (sofa, chair, table, etc.)
        - Price range (min and max if specified)
        - Color preferences
        - Style preferences (modern, traditional, etc.)
        - Room type (living room, bedroom, etc.)
        - Material preferences
        - Size constraints
        
        Format your response to include:
        1. Your helpful reply to the user
        2. Extracted preferences in this format (only if the user is asking for furniture): 
        PREFERENCES:
        {
          "category": "detected category or null",
          "priceMin": minimum price or null,
          "priceMax": maximum price or null,
          "colors": ["array of colors"] or null,
          "style": "detected style" or null,
          "room": "room type" or null,
          "intent": "one of: product_search, style_advice, price_question, general_query",
          "materials": ["array of materials"] or null,
          "dimensions": {"width": null, "height": null, "depth": null}
        }
        
        If it's a simple greeting or casual conversation, DO NOT extract preferences.
        `;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const fullText = response.text();
        
        // Extract AI response and preferences
        if (fullText.includes('PREFERENCES:')) {
          const parts = fullText.split('PREFERENCES:');
          aiResponse = parts[0].trim();
          
          // Try to parse the preferences JSON
          try {
            const preferencesText = parts[1].trim();
            const prefJson = preferencesText.match(/{[\s\S]*}/);
            if (prefJson) {
              extractedPreferences = JSON.parse(prefJson[0]);
              intent = extractedPreferences.intent || '';
            }
          } catch (parseError) {
            logger.warn(`Failed to parse preferences from AI: ${parseError.message}`);
          }
        } else {
          aiResponse = fullText.trim();
          // No preferences extracted, likely a general conversation
          intent = 'general_conversation';
        }
      } else {
        // Basic fallback for when AI is not available
        aiResponse = "I'm here to help you find the perfect furniture. Could you tell me what you're looking for?";
        
        // Basic keyword extraction as fallback
        extractedPreferences = basicFurniturePreferenceExtraction(message);
        intent = 'product_search';
      }
      
      // Merge any preferences directly provided by the frontend
      extractedPreferences = {
        ...extractedPreferences,
        ...preferences
      };
      
      // Determine if we should include product recommendations
      const shouldIncludeProducts = 
        intent === 'product_search' || 
        extractedPreferences.category || 
        message.toLowerCase().includes("furniture") ||
        message.toLowerCase().includes("show me") || 
        message.toLowerCase().includes("recommend") ||
        message.toLowerCase().includes("looking for") ||
        message.toLowerCase().includes("need a");
      
      if (shouldIncludeProducts) {
        // Search for products based on extracted preferences
        let productResults = await searchFurniture(extractedPreferences);
        
        // Filter previously shown products if provided
        if (preferences.previousProductIds && preferences.previousProductIds.length > 0) {
          const newProducts = productResults.filter(product => 
            !preferences.previousProductIds.includes(product._id.toString())
          );
          
          // If we have enough new products, prioritize them
          if (newProducts.length >= 3) {
            productResults = newProducts.slice(0, 5);
          }
        }
        
        // Filter by budget if specified
        if (extractedPreferences.priceMax && extractedPreferences.priceMax > 0) {
          productResults = productResults.filter(p => p.price <= extractedPreferences.priceMax);
        }
        
        // If we have product results, find price alternatives
        let priceAlternatives = null;
        if (productResults.length > 0 && productResults[0].category) {
          // Get category and average price of found products
          const category = productResults[0].category;
          const avgPrice = productResults.reduce((sum, p) => sum + p.price, 0) / productResults.length;
          
          // Find cheaper and more expensive alternatives
          const cheaper = await Product.find({ 
            category, 
            price: { $lt: avgPrice * 0.8 } 
          }).sort({ price: 1 }).limit(2).lean();
          
          const moreExpensive = await Product.find({ 
            category, 
            price: { $gt: avgPrice * 1.2 } 
          }).sort({ price: 1 }).limit(2).lean();
          
          if (cheaper.length > 0 || moreExpensive.length > 0) {
            priceAlternatives = {
              cheaper: cheaper.map(formatProduct),
              more_expensive: moreExpensive.map(formatProduct)
            };
          }
        }
        
        // Find complementary products if we have main products
        const complementaryItems = await findComplementaryProducts(productResults);
        
        // Generate appropriate follow-up questions
        const followUpQuestions = generateFollowUpQuestions(extractedPreferences, productResults.length);
        
        return {
          success: true,
          response: aiResponse,
          products: productResults.map(formatProduct),
          priceAlternatives,
          complementaryItems: complementaryItems.map(formatProduct),
          preferences: extractedPreferences,
          intent: intent || "product_search",
          followUpQuestions
        };
      } else {
        // For general conversation without product search intent
        return {
          success: true,
          response: aiResponse,
          preferences: extractedPreferences,
          intent: intent || "general_conversation",
          followUpQuestions: generateConversationalFollowUps(message)
        };
      }
    }
    
    // Direct product search based on structured preferences
    if (action === 'search') {
      const results = await searchFurniture(preferences);
      return {
        success: true,
        products: results.map(formatProduct),
        count: results.length
      };
    }
    
    // Get popular products
    if (action === 'popular') {
      const query = category ? { category } : {};
      const popularProducts = await Product.find(query)
        .sort({ popularity: -1 })
        .limit(5)
        .lean();
      
      return {
        success: true,
        products: popularProducts.map(formatProduct)
      };
    }
    
    // Get recommendations based on user's history
    if (action === 'recommendations' && userId) {
      const user = await User.findById(userId);
      if (!user) {
        return {
          success: false,
          message: 'User not found'
        };
      }
      
      // Get user's purchase history, viewed products, etc.
      // Implement your recommendation logic here
      const recommendations = await getPersonalizedRecommendations(user);
      
      return {
        success: true,
        products: recommendations.map(formatProduct)
      };
    }
    
    // Reset conversation context
    if (action === 'reset') {
      return {
        success: true,
        message: 'Conversation context reset successfully'
      };
    }
    
    // For any unhandled actions
    return {
      success: false,
      message: 'Unsupported action'
    };
  } catch (error) {
    logger.error(`Error in AI assistant: ${error.message}`, error);
    return {
      success: false,
      message: 'An error occurred while processing your request',
      error: error.message
    };
  }
}

// Helper function to detect if a message is just a greeting
function isGreeting(message) {
  const greetings = [
    "hi", "hello", "hey", "greetings", "good morning", "good afternoon", 
    "good evening", "howdy", "what's up", "sup", "hiya"
  ];
  
  const normalizedMessage = message.toLowerCase().trim();
  
  // Check if the message contains only a greeting
  return greetings.some(greeting => 
    normalizedMessage === greeting || 
    normalizedMessage.startsWith(greeting + " ") ||
    normalizedMessage.endsWith(" " + greeting)
  ) && normalizedMessage.split(" ").length <= 3; // Limit to short greetings
}

// Basic preference extraction without AI
function basicFurniturePreferenceExtraction(message) {
  const preferences = {
    category: null,
    priceMin: null,
    priceMax: null,
    colors: [],
    style: null,
    room: null
  };
  
  const lowerMessage = message.toLowerCase();
  
  // Extract furniture categories
  const categories = [
    'sofa', 'chair', 'table', 'bed', 'desk', 'dresser', 'nightstand', 
    'bookshelf', 'cabinet', 'couch', 'wardrobe', 'lamp'
  ];
  
  for (const category of categories) {
    if (lowerMessage.includes(category)) {
      preferences.category = category;
      break;
    }
  }
  
  // Extract price range
  const priceRegex = /(\$|under |less than |maximum |max |up to |no more than )(\d+)/gi;
  const priceMatches = [...lowerMessage.matchAll(priceRegex)];
  
  if (priceMatches.length > 0) {
    preferences.priceMax = parseInt(priceMatches[0][2]);
  }
  
  // Extract colors
  const colors = [
    'red', 'blue', 'green', 'yellow', 'black', 'white', 'brown', 
    'gray', 'grey', 'purple', 'orange', 'pink', 'beige'
  ];
  
  for (const color of colors) {
    if (lowerMessage.includes(color)) {
      preferences.colors.push(color);
    }
  }
  
  // Extract styles
  const styles = [
    'modern', 'contemporary', 'traditional', 'rustic', 'industrial', 
    'minimalist', 'scandinavian', 'bohemian', 'mid-century'
  ];
  
  for (const style of styles) {
    if (lowerMessage.includes(style)) {
      preferences.style = style;
      break;
    }
  }
  
  // Extract room types
  const rooms = [
    'living room', 'bedroom', 'kitchen', 'bathroom', 'office', 
    'dining room', 'den', 'study', 'guest room'
  ];
  
  for (const room of rooms) {
    if (lowerMessage.includes(room)) {
      preferences.room = room;
      break;
    }
  }
  
  return preferences;
}

// Search for furniture based on preferences
async function searchFurniture(preferences = {}) {
  const {
    category,
    priceMin,
    priceMax,
    colors,
    style,
    room,
    relatedProductId,
    previousProductIds = []
  } = preferences;
  
  const query = {};
  
  // Add category filter
  if (category) {
    query.category = { $regex: new RegExp(category, 'i') };
  }
  
  // Add price range filters
  if (priceMin !== null || priceMax !== null) {
    query.price = {};
    if (priceMin !== null) query.price.$gte = priceMin;
    if (priceMax !== null) query.price.$lte = priceMax;
  }
  
  // Add color filter
  if (colors && colors.length > 0) {
    const colorRegexes = colors.map(color => new RegExp(color, 'i'));
    query.$or = [
      { color: { $in: colorRegexes } },
      { description: { $in: colorRegexes } }
    ];
  }
  
  // Add style filter
  if (style) {
    const styleRegex = new RegExp(style, 'i');
    if (!query.$or) query.$or = [];
    query.$or.push(
      { style: styleRegex },
      { description: styleRegex }
    );
  }
  
  // Add room filter
  if (room) {
    const roomRegex = new RegExp(room, 'i');
    if (!query.$or) query.$or = [];
    query.$or.push(
      { roomType: roomRegex },
      { description: roomRegex }
    );
  }
  
  // Add related product logic
  let sortOptions = { popularity: -1 };
  if (relatedProductId) {
    try {
      const relatedProduct = await Product.findById(relatedProductId).lean();
      if (relatedProduct) {
        // Prioritize products in the same category
        if (relatedProduct.category) {
          query.category = relatedProduct.category;
        }
        
        // Prioritize products in a similar price range
        if (relatedProduct.price) {
          const priceRange = relatedProduct.price * 0.25; // 25% range
          query.price = {
            $gte: relatedProduct.price - priceRange,
            $lte: relatedProduct.price + priceRange
          };
        }
        
        // Sort by similarity if possible
        sortOptions = { category: 1, price: 1 };
      }
    } catch (err) {
      logger.warn(`Failed to get related product: ${err.message}`);
    }
  }
  
  // Get more products than needed for filtering
  const limit = previousProductIds.length > 0 ? 10 : 5;
  let results = await Product.find(query)
    .sort(sortOptions)
    .limit(limit)
    .lean();
  
  // Filter out previously shown products if available
  if (previousProductIds && previousProductIds.length > 0) {
    const newProducts = results.filter(product => 
      !previousProductIds.includes(product._id.toString())
    );
    
    // If we have enough new products, prioritize them
    if (newProducts.length >= 3) {
      return newProducts.slice(0, 5);
    }
  }
  
  // If no products found with the given filters, try a broader search
  if (results.length === 0) {
    // Try just the category
    if (category) {
      results = await Product.find({ category: { $regex: new RegExp(category, 'i') } })
        .sort({ popularity: -1 })
        .limit(5)
        .lean();
    }
    
    // If still no results, return popular products
    if (results.length === 0) {
      results = await Product.find({})
        .sort({ popularity: -1 })
        .limit(5)
        .lean();
    }
  }
  
  return results;
}

// Find complementary products for given products
async function findComplementaryProducts(products) {
  if (!products || products.length === 0) return [];
  
  // Define complementary categories
  const complementaryMap = {
    'sofa': ['coffee table', 'rug', 'lamp'],
    'chair': ['side table', 'ottoman'],
    'bed': ['nightstand', 'dresser', 'bedding'],
    'table': ['chair', 'tableware', 'rug'],
    'desk': ['office chair', 'desk lamp', 'bookshelf']
  };
  
  // Get categories from the main products
  const mainCategories = products.map(p => p.category).filter(Boolean);
  
  if (mainCategories.length === 0) return [];
  
  // Find complementary categories
  let complementaryCategories = [];
  for (const category of mainCategories) {
    const complementary = complementaryMap[category.toLowerCase()] || [];
    complementaryCategories = [...complementaryCategories, ...complementary];
  }
  
  if (complementaryCategories.length === 0) return [];
  
  // Find products in complementary categories
  const complementaryProducts = await Product.find({
    category: { $in: complementaryCategories.map(c => new RegExp(c, 'i')) }
  })
    .sort({ popularity: -1 })
    .limit(3)
    .lean();
  
  return complementaryProducts;
}

// Get personalized recommendations based on user history
async function getPersonalizedRecommendations(user) {
  // Implement personalization logic here
  // For now, just return popular products
  const popularProducts = await Product.find({})
    .sort({ popularity: -1 })
    .limit(5)
    .lean();
  
  return popularProducts;
}

// Format product data for response
function formatProduct(product) {
  return {
    id: product._id.toString(),
    title: product.name || 'Product',
    description: product.description || '',
    price: product.price || 0,
    image: product.image || '',
    rating: product.rating || 4.5,
    color: product.color || null,
    dimensions: product.dimensions || null,
    category: product.category || null
  };
}

// Generate appropriate follow-up questions based on preferences and results
function generateFollowUpQuestions(preferences, productCount) {
  const questions = [];
  
  // If no results or few results, ask for more information
  if (productCount === 0) {
    questions.push("Could you tell me more about what you're looking for?");
    questions.push("Would you like to try a different category of furniture?");
    return questions;
  }
  
  // If no category specified, ask about it
  if (!preferences.category) {
    questions.push("What type of furniture are you looking for?");
  }
  
  // If no price range, ask about budget
  if (!preferences.priceMin && !preferences.priceMax) {
    questions.push("What's your budget for this purchase?");
  }
  
  // If they mentioned specific furniture, ask about style
  if (preferences.category && !preferences.style) {
    questions.push(`What style of ${preferences.category} do you prefer?`);
  }
  
  // If budget is very low, offer alternatives
  if (preferences.priceMax && preferences.priceMax < 100 && preferences.category) {
    questions.push(`Would you consider increasing your budget for better quality ${preferences.category}?`);
  }
  
  // If no room specified, ask about it
  if (!preferences.room && preferences.category) {
    questions.push(`Which room will this ${preferences.category} be used in?`);
  }
  
  // Add some variety for different categories
  if (preferences.category === 'sofa' || preferences.category === 'couch') {
    questions.push("How many people do you need to seat on your sofa?");
  } else if (preferences.category === 'bed') {
    questions.push("What size bed are you looking for?");
  } else if (preferences.category === 'table') {
    questions.push("How many people do you need to accommodate at your table?");
  }
  
  // Limit to 3 questions max
  return questions.slice(0, 3);
}

// Generate conversational follow-up questions for general chat
function generateConversationalFollowUps(message) {
  const lowerMessage = message.toLowerCase();
  
  // For general furniture inquiries
  if (lowerMessage.includes('furniture')) {
    return [
      "What type of furniture are you interested in?",
      "Is there a specific room you're shopping for?",
      "Do you have a preferred style or color?"
    ];
  }
  
  // For style inquiries
  if (lowerMessage.includes('style') || lowerMessage.includes('design')) {
    return [
      "What's your current home decor style?",
      "Are you looking to redesign a specific room?",
      "Do you prefer modern or traditional furniture?"
    ];
  }
  
  // Default questions to engage the customer
  return [
    "What kind of furniture are you looking for today?",
    "Is there a specific room you're shopping for?",
    "Do you have a particular budget in mind?"
  ];
}

module.exports = {
  aiAssistant,
  capabilities: assistantCapabilities
};