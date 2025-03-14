const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');
require('dotenv').config();
const { authJwt } = require('./middlewares/jwt');
const errorHandler = require('./middlewares/error_handler');

const app = express();
const env = process.env;
const API=env.API_URL;

// Middlewares
app.use(express.json());  
app.use(morgan('tiny'));  
app.use(cors());    
app.options ('*',cors()) ;  


const authRouter= require('./routes/auth');
const userRouter= require('./routes/users');

app.use(`${API}/`,authRouter);
app.use(authJwt());  
app.use(`${API}/`,userRouter);


app.use(errorHandler);



// MongoDB connection
mongoose.connect(env.MONGODB_CONNECTION_STRING, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true })
    .then(() => {
        console.log('Connected to DB!');
    })
    .catch((error) => {
        console.error('Error connecting to MongoDB:', error);
    });

// Start server
const hostname = env.HOST || 'localhost'; 
const port = env.PORT || 5000;           

app.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});
 