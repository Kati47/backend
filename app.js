const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');
require('dotenv').config();
const productRouter = require('./routes/product');
const reviewRouter = require('./routes/reviewRoutes');
const cartRouter = require('./routes/cart');
const orderRouter = require('./routes/order');
const promoRouter = require('./routes/promo');
const paymentRouter = require('./routes/stripe');
const { authJwt } = require('./middlewares/jwt');
const roomPlannerRouter = require('./routes/roomPlanner');
const authRouter= require('./routes/auth');
const userRouter= require('./routes/users');
const testRouter= require('./routes/test');
const errorHandler = require('./middlewares/error_handler');
const cookieParser = require('cookie-parser');
const path = require('path');  

const app = express();
app.use('/images', express.static(path.join(__dirname, 'public/images')));

const env = process.env;
const API=env.API_URL;




// Middlewares
app.use(express.json());  
app.use(morgan('tiny'));  
app.use(cors({
    origin: true, // In production, set to your frontend domain
    credentials: true,  // CRITICAL: allows cookies to be sent/received
    exposedHeaders: ['set-cookie']
}));

app.options('*', cors({
    origin: true,
    credentials: true,
    exposedHeaders: ['set-cookie']
}));
app.use(cookieParser());


app.use(`${API}/`,testRouter);
app.use(`${API}/`,authRouter);

app.use(authJwt());  
app.use(`${API}/products` ,productRouter);
app.use(`${API}/cart` ,cartRouter);
app.use(`${API}/order` ,orderRouter);
app.use(`${API}/reviews` ,reviewRouter);
app.use(`${API}/promo` ,promoRouter);
app.use('/api/checkout' ,paymentRouter);
app.use(`${API}/users`,userRouter);


app.use(errorHandler);


// Add to your app.js or index.js
if (process.env.NODE_ENV !== 'test') {
    // Don't run scheduler in test environment
    require('./helpers/product_mailer');
}

// Add debug logs for environment variables
console.log('Environment variables:');
console.log('NODE_ENV:', env.NODE_ENV);
console.log('HOST:', env.HOST);
console.log('PORT:', env.PORT);
console.log('API_URL:', env.API_URL);

// Debug the MongoDB connection string specifically
console.log('MONGODB_CONNECTION_STRING exists:', env.MONGODB_CONNECTION_STRING !== undefined);
console.log('MONGODB_CONNECTION_STRING type:', typeof env.MONGODB_CONNECTION_STRING);
console.log('Raw connection string from .env file:');
console.log(env.MONGODB_CONNECTION_STRING);

// List all keys from .env file to check if we're missing something
console.log('All available environment variables:');
console.log(Object.keys(env));

// MongoDB connection with better error handling
const dbConnect = async () => {
  try {
    console.log('Attempting to connect to MongoDB...');
    
    // Check if connection string exists
    if (!env.MONGODB_CONNECTION_STRING) {
      console.error('MongoDB connection string is undefined or empty!');
      console.error('Please check your .env file for MONGODB_CONNECTION_STRING=');
      
      // Check if we have the raw connection string without variable name
      const envKeys = Object.keys(env);
      const suspiciousKey = envKeys.find(key => 
        key.includes('mongodb://') || 
        key.startsWith('cluster0') || 
        key.includes('@3gkmn.mongodb.net')
      );
      
      if (suspiciousKey) {
        console.error('Found a key that looks like a MongoDB connection string:', suspiciousKey);
        console.error('This suggests your .env file has the connection string without MONGODB_CONNECTION_STRING=');
      }
      
      return;
    }
    
    console.log('Connection string found, proceeding with connection...');
    
    await mongoose.connect(env.MONGODB_CONNECTION_STRING, { 
      useNewUrlParser: true, 
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 60000,
      socketTimeoutMS: 45000,
      family: 4
    });
    
    console.log('Connected to MongoDB successfully!');
  } catch (error) {
    console.error('Error connecting to MongoDB:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    if (error.code) {
      console.error('Error code:', error.code);
    }
    
    if (error.reason) {
      console.error('Error reason:', error.reason);
    }
  }
};

// Call the connection function
dbConnect();

// Start server
const hostname = env.HOST || 'localhost'; 
const port = env.PORT || 5000;           

app.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});