/**
 * Simple logging utility
 */
const logger = {
  info: (message) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
  },
  
  debug: (message) => {
    console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`);
  },
  
  warn: (message) => {
    console.log(`[WARN] ${new Date().toISOString()} - ${message}`);
  },
  
  error: (message, error = null) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`);
    if (error && error.stack) {
      console.error(error.stack);
    }
  }
};

module.exports = logger;