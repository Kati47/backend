const { GoogleGenerativeAI } = require('@google/generative-ai');
const Product = require('../models/product');
const Order = require('../models/order');
const User = require('../models/user');
const logger = require('../utils/logger');
require('dotenv').config();

// Initialize the Gemini API
logger.info('Initializing Furniture E-Commerce Assistant');
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  logger.error('Missing Gemini API key - assistant functionality will be limited');
}

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;
logger.info(`AI service initialized: ${!!genAI}`);

// Assistant capabilities for reference
const assistantCapabilities = [
  { id: 'product_search', name: 'Furniture Search', description: 'Search for furniture using natural language' },
  { id: 'recommendations', name: 'Smart Recommendations', description: 'Get personalized furniture recommendations' },
  { id: 'filtering', name: 'Filter & Sort', description: 'Filter and sort furniture by various criteria' },
  { id: 'popular_items', name: 'Popular Items', description: 'Discover trending and popular furniture' },
  { id: 'price_comparison', name: 'Price Comparison', description: 'Compare prices across similar furniture items' }
];

/**
 * Process user message and generate response with furniture recommendations
 * @param {string} userMessage - User's message
 * @param {Array} conversationHistory - Previous conversation messages
 * @param {Object} contextData - Optional context data like userId
 * @returns {Promise<Object>} Response with recommendations
 */
async function processMessage(userMessage, conversationHistory = [], contextData = {}) {
  logger.info(`Processing message: "${userMessage?.substring(0, 50)}..."`);
  
  try {
    if (!userMessage || typeof userMessage !== 'string') {
      return { success: false, response: 'Please provide a valid message.' };
    }
    
    if (!genAI) {
      return { success: false, response: 'AI service is currently unavailable.' };
    }
    
    // Determine the intent of the message
    const intent = await determineIntent(userMessage);
    logger.info(`Detected intent: ${intent}`);
    
    // Extract furniture preferences from user message using Gemini
    const preferences = await extractFurniturePreferences(userMessage);
    logger.info(`Extracted preferences: ${JSON.stringify(preferences)}`);
    
    let products = [];
    let response = '';
    
    // Handle different intents
    switch (intent) {
      case 'product_search':
        products = await searchFurniture(preferences);
        break;
      case 'recommendations':
        products = await getFurnitureRecommendations(preferences, contextData.userId);
        break;
      case 'popular_items':
        products = await getPopularFurniture(preferences.category);
        break;
      case 'filter_sort':
        products = await filterAndSortFurniture(preferences);
        break;
      default:
        products = await searchFurniture(preferences);
    }
    
    // Generate a natural language response
    response = await generateResponse(userMessage, products, preferences, intent);
    
    // Save interaction for future recommendation improvements if user is logged in
    if (contextData.userId) {
      await saveUserInteraction(contextData.userId, preferences, products.map(p => p._id));
    }
    
    return {
      success: true,
      response,
      products: products.map(formatProduct),
      intent,
      preferences,
      filterOptions: generateFilterOptions(products)
    };
  } catch (error) {
    logger.error(`Error in processMessage: ${error.message}`, error);
    return { 
      success: false, 
      response: 'Sorry, I encountered an error while processing your request. Please try again.' 
    };
  }
}

/**
 * Determine the intent of the user message
 * @param {string} message - User message
 * @returns {Promise<string>} Intent classification
 */
async function determineIntent(message) {
  try {
    const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });
    
    const prompt = `
    Classify the following furniture e-commerce customer message into exactly one of these intents:
    - product_search: Looking for specific furniture or items
    - recommendations: Asking for furniture recommendations
    - popular_items: Asking about popular or trending furniture
    - filter_sort: Wanting to filter or sort furniture
    
    Customer message: "${message}"
    
    Respond with ONLY the intent name and nothing else.
    `;
    
    const result = await model.generateContent(prompt);
    const intent = result.response.text().trim().toLowerCase();
    
    // Validate that the response is one of our expected intents
    const validIntents = ['product_search', 'recommendations', 'popular_items', 'filter_sort'];
    return validIntents.includes(intent) ? intent : 'product_search';
  } catch (error) {
    logger.error(`Error determining intent: ${error.message}`, error);
    return 'product_search'; // Default to product search on error
  }
}

/**
 * Extract furniture preferences from user message using Gemini
 * @param {string} message - User message
 * @returns {Promise<Object>} Extracted preferences
 */
async function extractFurniturePreferences(message) {
  try {
    const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });
    
    const prompt = `
    Extract furniture preferences from this e-commerce customer message: "${message}"
    
    Return ONLY a JSON object with these fields (leave empty if not mentioned):
    - category: the type of furniture (e.g., sofa, table, chair, bed, dresser, bookcase)
    - color: any mentioned colors
    - material: any mentioned materials (wood, leather, fabric, etc.)
    - priceMin: minimum price if mentioned (number only)
    - priceMax: maximum price if mentioned (number only)
    - size: any size specifications
    - room: intended room (living room, bedroom, dining room, etc.)
    - style: furniture style (modern, traditional, rustic, etc.)
    - features: array of specific features requested (storage, reclining, adjustable, etc.)
    - sortBy: how they want to sort (price_low, price_high, rating, newest)
    
    Return valid JSON only. No explanation.
    `;
    
    const result = await model.generateContent(prompt);
    const jsonStr = result.response.text();
    
    try {
      const preferences = JSON.parse(jsonStr);
      // Add safeguards for missing fields
      return {
        category: preferences.category || null,
        color: preferences.color || null,
        material: preferences.material || null,
        priceMin: preferences.priceMin || null,
        priceMax: preferences.priceMax || null,
        size: preferences.size || null,
        room: preferences.room || null,
        style: preferences.style || null,
        sortBy: preferences.sortBy || null,
        features: Array.isArray(preferences.features) ? preferences.features : []
      };
    } catch (jsonError) {
      logger.error(`Error parsing preferences JSON: ${jsonError.message}`);
      // Fallback to basic extraction
      return basicFurniturePreferenceExtraction(message);
    }
  } catch (error) {
    logger.error(`Error extracting preferences: ${error.message}`, error);
    return basicFurniturePreferenceExtraction(message);
  }
}

/**
 * Basic fallback furniture preference extraction using regex patterns
 * @param {string} message - User message
 * @returns {Object} Extracted preferences
 */
function basicFurniturePreferenceExtraction(message) {
  const lowerMessage = message.toLowerCase();
  
  // Extract furniture categories
  const categories = [
    'sofa', 'couch', 'chair', 'table', 'desk', 'bed', 'dresser', 'bookcase', 
    'bookshelf', 'cabinet', 'wardrobe', 'nightstand', 'ottoman', 'bench', 
    'dining table', 'coffee table', 'sectional', 'recliner', 'loveseat', 
    'armchair', 'shelving', 'storage'
  ];
  const category = categories.find(cat => lowerMessage.includes(cat));
  
  // Extract common colors for furniture
  const colors = [
    'black', 'white', 'brown', 'beige', 'gray', 'grey', 'oak', 'walnut', 
    'mahogany', 'cherry', 'espresso', 'natural', 'blue', 'green', 'red', 
    'yellow', 'purple', 'pink', 'teal', 'navy'
  ];
  const color = colors.find(c => lowerMessage.includes(c));
  
  // Extract materials commonly used in furniture
  const materials = [
    'wood', 'oak', 'pine', 'walnut', 'maple', 'leather', 'fabric', 'velvet', 
    'linen', 'metal', 'glass', 'plastic', 'acrylic', 'marble', 'rattan', 
    'wicker', 'upholstered', 'microfiber', 'polyester'
  ];
  const material = materials.find(m => lowerMessage.includes(m));
  
  // Extract furniture styles
  const styles = [
    'modern', 'contemporary', 'traditional', 'rustic', 'farmhouse', 'industrial', 
    'mid-century', 'scandinavian', 'bohemian', 'coastal', 'vintage', 'minimalist'
  ];
  const style = styles.find(s => lowerMessage.includes(s));
  
  // Extract room types
  const rooms = [
    'living room', 'bedroom', 'dining room', 'kitchen', 'office', 'bathroom', 
    'entryway', 'hallway', 'outdoor', 'patio', 'nursery', 'kids room'
  ];
  const room = rooms.find(r => lowerMessage.includes(r));
  
  // Extract price range
  let priceMin = null;
  let priceMax = null;
  
  const underMatch = lowerMessage.match(/under\s+\$?(\d+)/i);
  if (underMatch) {
    priceMax = parseInt(underMatch[1]);
  }
  
  const overMatch = lowerMessage.match(/over\s+\$?(\d+)/i);
  if (overMatch) {
    priceMin = parseInt(overMatch[1]);
  }
  
  const betweenMatch = lowerMessage.match(/between\s+\$?(\d+)\s+and\s+\$?(\d+)/i);
  if (betweenMatch) {
    priceMin = parseInt(betweenMatch[1]);
    priceMax = parseInt(betweenMatch[2]);
  }
  
  // Extract common furniture features
  const features = [];
  const furnitureFeatures = [
    'adjustable', 'reclining', 'extendable', 'foldable', 'convertible', 
    'storage', 'modular', 'ergonomic', 'swivel', 'tufted', 'high back', 
    'low back', 'king size', 'queen size', 'twin size', 'full size', 
    'with drawers', 'with shelves', 'sleeper', 'pull-out', 'lift-top'
  ];
  
  furnitureFeatures.forEach(feature => {
    if (lowerMessage.includes(feature)) {
      features.push(feature);
    }
  });
  
  // Extract sort preference
  let sortBy = null;
  if (lowerMessage.includes('cheapest') || lowerMessage.includes('lowest price')) {
    sortBy = 'price_low';
  } else if (lowerMessage.includes('expensive') || lowerMessage.includes('highest price')) {
    sortBy = 'price_high';
  } else if (lowerMessage.includes('best rated') || lowerMessage.includes('highest rated')) {
    sortBy = 'rating';
  } else if (lowerMessage.includes('newest') || lowerMessage.includes('latest')) {
    sortBy = 'newest';
  }
  
  return {
    category,
    color,
    material,
    priceMin,
    priceMax,
    size: null,
    room,
    style,
    sortBy,
    features
  };
}

/**
 * Search furniture based on extracted preferences
 * @param {Object} preferences - User preferences
 * @returns {Promise<Array>} Matching furniture products
 */
async function searchFurniture(preferences) {
  try {
    // Always search for furniture by ensuring the categories or title include furniture terms
    const query = { inStock: true };
    
    // Add furniture category filter
    const furnitureTerms = [
      'sofa', 'couch', 'chair', 'table', 'desk', 'bed', 'dresser', 'bookcase', 
      'bookshelf', 'cabinet', 'wardrobe', 'nightstand', 'ottoman', 'bench', 
      'sectional', 'recliner', 'loveseat', 'armchair', 'shelving', 'storage', 
      'furniture'
    ];
    
    // If specific category is requested, use that, otherwise ensure we're only getting furniture
    if (preferences.category) {
      query.$or = [
        { categories: { $regex: preferences.category, $options: 'i' } },
        { title: { $regex: preferences.category, $options: 'i' } },
        { desc: { $regex: preferences.category, $options: 'i' } }
      ];
    } else {
      // Ensure we only get furniture items if no specific category is mentioned
      const furnitureQueries = furnitureTerms.map(term => ({
        $or: [
          { categories: { $regex: term, $options: 'i' } },
          { title: { $regex: term, $options: 'i' } }
        ]
      }));
      query.$or = furnitureQueries;
    }
    
    // Color filter
    if (preferences.color) {
      if (!query.$and) query.$and = [];
      query.$and.push({
        $or: [
          { color: { $regex: preferences.color, $options: 'i' } },
          { desc: { $regex: `${preferences.color}.*color|${preferences.color}.*finish`, $options: 'i' } }
        ]
      });
    }
    
    // Material filter
    if (preferences.material) {
      if (!query.$and) query.$and = [];
      query.$and.push({
        $or: [
          { material: { $regex: preferences.material, $options: 'i' } },
          { desc: { $regex: `${preferences.material}.*material|made of.*${preferences.material}`, $options: 'i' } }
        ]
      });
    }
    
    // Style filter
    if (preferences.style) {
      if (!query.$and) query.$and = [];
      query.$and.push({
        $or: [
          { style: { $regex: preferences.style, $options: 'i' } },
          { desc: { $regex: `${preferences.style}.*style|${preferences.style}.*design`, $options: 'i' } },
          { title: { $regex: preferences.style, $options: 'i' } }
        ]
      });
    }
    
    // Room filter
    if (preferences.room) {
      if (!query.$and) query.$and = [];
      query.$and.push({
        $or: [
          { room: { $regex: preferences.room, $options: 'i' } },
          { categories: { $regex: preferences.room.replace(' ', '-'), $options: 'i' } },
          { categories: { $regex: preferences.room.replace(' ', ''), $options: 'i' } },
          { desc: { $regex: `${preferences.room}|for.*${preferences.room}`, $options: 'i' } }
        ]
      });
    }
    
    // Size filter
    if (preferences.size) {
      if (!query.$and) query.$and = [];
      query.$and.push({
        $or: [
          { size: { $regex: preferences.size, $options: 'i' } },
          { desc: { $regex: `${preferences.size}.*size|${preferences.size}.*dimensions`, $options: 'i' } }
        ]
      });
    }
    
    // Price range filter
    if (preferences.priceMin !== null || preferences.priceMax !== null) {
      query.price = {};
      if (preferences.priceMin !== null) {
        query.price.$gte = preferences.priceMin;
      }
      if (preferences.priceMax !== null) {
        query.price.$lte = preferences.priceMax;
      }
    }
    
    // Feature filtering through keywords in description
    if (preferences.features && preferences.features.length > 0) {
      const featureQueries = preferences.features.map(feature => ({
        $or: [
          { features: { $regex: feature, $options: 'i' } },
          { desc: { $regex: feature, $options: 'i' } },
          { title: { $regex: feature, $options: 'i' } }
        ]
      }));
      
      if (!query.$and) query.$and = [];
      query.$and.push({ $or: featureQueries });
    }
    
    // Determine sort order
    let sortOptions = {};
    switch (preferences.sortBy) {
      case 'price_low':
        sortOptions = { price: 1 };
        break;
      case 'price_high':
        sortOptions = { price: -1 };
        break;
      case 'rating':
        sortOptions = { averageRating: -1 };
        break;
      case 'newest':
        sortOptions = { createdAt: -1 };
        break;
      default:
        // Default sorting by relevance (approximated by rating and then newer items)
        sortOptions = { averageRating: -1, createdAt: -1 };
    }
    
    logger.info(`Searching furniture with query: ${JSON.stringify(query)}`);
    
    const products = await Product.find(query)
      .sort(sortOptions)
      .limit(10);
    
    logger.info(`Found ${products.length} furniture items matching criteria`);
    return products;
  } catch (error) {
    logger.error(`Error searching furniture: ${error.message}`, error);
    return [];
  }
}

/**
 * Get personalized furniture recommendations
 * @param {Object} preferences - Current search preferences
 * @param {string} userId - Optional user ID for personalized recommendations
 * @returns {Promise<Array>} Recommended furniture products
 */
async function getFurnitureRecommendations(preferences, userId = null) {
  try {
    // First, get furniture matching current preferences
    const baseFurniture = await searchFurniture(preferences);
    
    // If we have a userId, try to get personalized recommendations
    if (userId) {
      const user = await User.findById(userId);
      
      if (user) {
        // Check user's order history
        const userOrders = await Order.find({ userId: userId })
          .sort({ createdAt: -1 })
          .limit(5);
        
        const purchasedProductIds = userOrders.flatMap(order => 
          order.products.map(product => product.productId)
        );
        
        if (purchasedProductIds.length > 0) {
          // Look up purchased products
          const purchasedProducts = await Product.find({
            _id: { $in: purchasedProductIds }
          });
          
          // Extract categories, styles, and materials from purchased products
          const purchasedCategories = purchasedProducts.flatMap(product => 
            product.categories || []
          );
          
          const purchasedStyles = purchasedProducts
            .filter(product => product.style)
            .map(product => product.style);
          
          const purchasedMaterials = purchasedProducts
            .filter(product => product.material)
            .map(product => product.material);
          
          // Find complementary furniture products based on purchase history
          if (purchasedCategories.length > 0 || purchasedStyles.length > 0 || purchasedMaterials.length > 0) {
            const recommendationQuery = {
              _id: { $nin: purchasedProductIds }, // Exclude already purchased products
              inStock: true
            };
            
            const orConditions = [];
            
            // Add category-based recommendations
            if (purchasedCategories.length > 0) {
              orConditions.push({ categories: { $in: purchasedCategories } });
            }
            
            // Add style-based recommendations
            if (purchasedStyles.length > 0) {
              orConditions.push({ style: { $in: purchasedStyles } });
            }
            
            // Add material-based recommendations
            if (purchasedMaterials.length > 0) {
              orConditions.push({ material: { $in: purchasedMaterials } });
            }
            
            // Only add $or if we have conditions to add
            if (orConditions.length > 0) {
              recommendationQuery.$or = orConditions;
            }
            
            const similarProducts = await Product.find(recommendationQuery)
              .sort({ averageRating: -1 })
              .limit(5);
            
            // Combine with base products and remove duplicates
            const allRecommendations = [...baseFurniture, ...similarProducts];
            const uniqueRecommendations = Array.from(
              new Map(allRecommendations.map(item => [item._id.toString(), item])).values()
            );
            
            return uniqueRecommendations.slice(0, 10);
          }
        }
      }
    }
    
    // Fallback to popular items in the same category if no personalized recommendations
    if (preferences.category) {
      return await getPopularFurniture(preferences.category);
    }
    
    return baseFurniture;
  } catch (error) {
    logger.error(`Error getting furniture recommendations: ${error.message}`, error);
    return [];
  }
}

/**
 * Get popular furniture in a category
 * @param {string} category - Optional category to filter by
 * @returns {Promise<Array>} Popular furniture products
 */
async function getPopularFurniture(category = null) {
  try {
    // Start with furniture query - ensure we always get furniture items
    const furnitureTerms = [
      'sofa', 'couch', 'chair', 'table', 'desk', 'bed', 'dresser', 'bookcase', 
      'cabinet', 'wardrobe', 'furniture'
    ];
    
    const furnitureQueries = furnitureTerms.map(term => ({
      $or: [
        { categories: { $regex: term, $options: 'i' } },
        { title: { $regex: term, $options: 'i' } }
      ]
    }));
    
    const query = { 
      inStock: true,
      $or: furnitureQueries
    };
    
    // Add category filter if specified
    if (category) {
      query.$and = [
        {
          $or: [
            { categories: { $regex: category, $options: 'i' } },
            { title: { $regex: category, $options: 'i' } }
          ]
        }
      ];
    }
    
    // Popular items are those with high ratings and more reviews
    const popularFurniture = await Product.find(query)
      .sort({ averageRating: -1, numReviews: -1 })
      .limit(10);
    
    logger.info(`Found ${popularFurniture.length} popular furniture items${category ? ' in category ' + category : ''}`);
    return popularFurniture;
  } catch (error) {
    logger.error(`Error getting popular furniture: ${error.message}`, error);
    return [];
  }
}

/**
 * Filter and sort furniture based on preferences
 * @param {Object} preferences - Filter and sort preferences
 * @returns {Promise<Array>} Filtered and sorted furniture products
 */
async function filterAndSortFurniture(preferences) {
  // Leverage the existing search function as it already implements filtering and sorting
  return await searchFurniture(preferences);
}

/**
 * Generate filter options based on the result set
 * @param {Array} products - Products to analyze
 * @returns {Object} Available filter options
 */
function generateFilterOptions(products) {
  if (!products || products.length === 0) {
    return {};
  }
  
  // Extract available values for various filter attributes
  const colors = new Set();
  const categories = new Set();
  const materials = new Set();
  const styles = new Set();
  const rooms = new Set();
  
  let minPrice = Number.MAX_VALUE;
  let maxPrice = 0;
  
  products.forEach(product => {
    if (product.color) colors.add(product.color);
    if (product.categories) {
      product.categories.forEach(category => categories.add(category));
    }
    if (product.material) materials.add(product.material);
    if (product.style) styles.add(product.style);
    if (product.room) rooms.add(product.room);
    
    if (product.price < minPrice) minPrice = product.price;
    if (product.price > maxPrice) maxPrice = product.price;
  });
  
  return {
    categories: Array.from(categories),
    colors: Array.from(colors),
    materials: Array.from(materials),
    styles: Array.from(styles),
    rooms: Array.from(rooms),
    priceRange: {
      min: minPrice === Number.MAX_VALUE ? 0 : minPrice,
      max: maxPrice
    },
    sortOptions: [
      { id: 'price_low', name: 'Price: Low to High' },
      { id: 'price_high', name: 'Price: High to Low' },
      { id: 'rating', name: 'Highest Rated' },
      { id: 'newest', name: 'Newest Arrivals' }
    ]
  };
}

/**
 * Save user interaction for improving future recommendations
 * @param {string} userId - User ID
 * @param {Object} preferences - Search preferences
 * @param {Array} productIds - Viewed product IDs
 */
async function saveUserInteraction(userId, preferences, productIds) {
  try {
    // This is a placeholder for a more sophisticated recommendation system
    // You would typically save this data to a user interaction/history collection
    logger.info(`Saved furniture interaction for user ${userId} with ${productIds.length} products`);
    
    // This could be expanded to update a user preferences model
    // or feed into a recommendation engine
  } catch (error) {
    logger.error(`Error saving user interaction: ${error.message}`, error);
  }
}

/**
 * Generate natural language response using Gemini
 * @param {string} userMessage - Original user message
 * @param {Array} products - Found products
 * @param {Object} preferences - Extracted preferences
 * @param {string} intent - Detected intent
 * @returns {Promise<string>} Natural language response
 */
async function generateResponse(userMessage, products, preferences, intent) {
  try {
    const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });
    
    // Prepare product information for the prompt
    const productInfo = products.length > 0 
      ? products.slice(0, 5).map((p, i) => 
          `${i+1}. ${p.title} - $${p.price} - ${p.desc ? p.desc.substring(0, 50) + '...' : 'No description'}`
        ).join('\n')
      : 'No furniture products found matching the criteria.';
    
    const filterInfo = Object.entries(preferences)
      .filter(([key, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
      .join(', ');
    
    // Craft the prompt based on intent
    let responsePrompt = '';
    
    switch (intent) {
      case 'product_search':
        responsePrompt = `
        You are a helpful furniture store assistant. The customer asked: "${userMessage}"
        
        I searched for furniture with these criteria: ${filterInfo || 'No specific criteria'}
        
        Results:
        ${productInfo}
        
        Please generate a helpful, friendly response (2-3 sentences) that addresses their query about furniture.
        Mention the most relevant furniture features and how they match what the customer is looking for.
        If no products were found, suggest broadening their search or alternative furniture they might consider.
        Your response should be conversational and helpful.
        `;
        break;
        
      case 'recommendations':
        responsePrompt = `
        You are a helpful furniture store assistant. The customer asked for recommendations: "${userMessage}"
        
        Based on their preferences (${filterInfo || 'no specific preferences'}), I found these furniture recommendations:
        ${productInfo}
        
        Please generate a helpful, friendly response (2-3 sentences) that highlights why these furniture pieces
        would be good for them based on their stated preferences. Mention key features and benefits.
        If no products were found, suggest alternative furniture they might consider.
        `;
        break;
        
      case 'popular_items':
        responsePrompt = `
        You are a helpful furniture store assistant. The customer asked about popular items: "${userMessage}"
        
        I found these popular furniture items${preferences.category ? ' in ' + preferences.category : ''}:
        ${productInfo}
        
        Please generate a helpful, friendly response (2-3 sentences) that highlights why these furniture pieces
        are popular. Mention what makes them stand out and why customers love them.
        If no products were found, suggest some generally popular furniture categories they might explore.
        `;
        break;
        
      case 'filter_sort':
        responsePrompt = `
        You are a helpful furniture store assistant. The customer asked to filter or sort furniture: "${userMessage}"
        
        I filtered furniture based on: ${filterInfo || 'No specific criteria'}
        
        Results:
        ${productInfo}
        
        Please generate a helpful, friendly response (2-3 sentences) that acknowledges their filtering request
        and explains the results. Mention additional filter options they might consider to refine their furniture search.
        If no products were found, suggest broadening their filters.
        `;
        break;
        
      default:
        responsePrompt = `
        You are a helpful furniture store assistant. The customer said: "${userMessage}"
        
        I found these furniture items that might be relevant:
        ${productInfo}
        
        Please generate a helpful, friendly response (2-3 sentences) that addresses their query
        about furniture and mentions the available options or suggests alternatives if nothing was found.
        `;
    }
    
    const result = await model.generateContent(responsePrompt);
    return result.response.text();
  } catch (error) {
    logger.error(`Error generating response: ${error.message}`, error);
    
    // Fallback response if AI generation fails
    if (products.length > 0) {
      return `I found ${products.length} furniture items that match what you're looking for. You can see them below.`;
    } else {
      return "I couldn't find any furniture matching your criteria. Would you like to try a different search?";
    }
  }
}

/**
 * Format product for response
 * @param {Object} product - Database product
 * @returns {Object} Formatted product
 */
function formatProduct(product) {
  return {
    id: product._id.toString(),
    title: product.title,
    description: product.desc || '',
    price: product.price,
    color: product.color || '',
    material: product.material || '',
    style: product.style || '',
    room: product.room || '',
    categories: product.categories || [],
    size: product.size || '',
    features: product.features || [],
    image: product.img || '',
    images: product.images || [],
    inStock: product.inStock,
    rating: product.averageRating || 0,
    numReviews: product.numReviews || 0,
    createdAt: product.createdAt
  };
}

module.exports = {
  processMessage,
  searchFurniture,
  getFurnitureRecommendations,
  getPopularFurniture,
  filterAndSortFurniture,
  formatProduct,
  capabilities: assistantCapabilities
};