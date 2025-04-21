const nodemailer = require('nodemailer');

/**
 * Email sender functions for your application
 */

/**
 * Create a nodemailer transporter
 * 
 * @returns {object} configured nodemailer transporter
 */
const createTransporter = () => {
  // For Gmail:
  return nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: 'khadijahouda70@gmail.com', 
      pass: 'evslegjnlovlbhaj'
    },
    tls: {
      rejectUnauthorized: false // Fix for self-signed certificate error
    }
  });
};

/**
 * Create a consistent email template
 * @param {string} title Email title/heading
 * @param {string} content Main email content (HTML)
 * @param {object} options Template customization options
 * @returns {string} Complete HTML email template
 */
const createEmailTemplate = (title, content, options = {}) => {
  const {
    headerBgColor = '#f8f9fa',
    headerTextColor = '#5c6ac4',
    contentBgColor = '#ffffff',
    footerBgColor = '#f8f9fa',
    footerTextColor = '#666666',
    storeName = 'Your Store Name',
    storeLogo = '', // Optional logo URL
    year = new Date().getFullYear(),
    additionalFooterText = ''
  } = options;
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; color: #333333; background-color: #f4f4f4;">
      <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.1);">
        <!-- Header Section -->
        <div style="background-color: ${headerBgColor}; padding: 20px; text-align: center;">
          ${storeLogo ? `<img src="${storeLogo}" alt="${storeName}" style="max-height: 60px; margin-bottom: 10px;">` : ''}
          <h1 style="color: ${headerTextColor}; margin: 0; font-size: 24px;">${title}</h1>
        </div>
        
        <!-- Content Section -->
        <div style="background-color: ${contentBgColor}; padding: 20px;">
          ${content}
        </div>
        
        <!-- Footer Section -->
        <div style="background-color: ${footerBgColor}; padding: 20px; text-align: center; font-size: 12px; color: ${footerTextColor};">
          <p>&copy; ${year} ${storeName}. All rights reserved.</p>
          ${additionalFooterText ? `<p>${additionalFooterText}</p>` : ''}
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Send an email with the standard template
 * 
 * @param {string} to - Recipient's email address
 * @param {string} subject - Email subject
 * @param {string} title - Email title/heading
 * @param {string} content - Email content (HTML)
 * @param {object} templateOptions - Template customization options
 * @returns {Promise<string>} Result message
 */
exports.sendTemplatedEmail = async (to, subject, title, content, templateOptions = {}) => {
  try {
    // Apply the template to the content
    const htmlMessage = createEmailTemplate(title, content, templateOptions);
    
    // Send the email with the templated content
    return await exports.sendMail(to, subject, htmlMessage);
  } catch (error) {
    console.error('Error sending templated email:', error);
    return `Failed to send email: ${error.message}`;
  }
};

/**
 * Send an email (low-level function, prefer using sendTemplatedEmail)
 * 
 * @param {string} to - Recipient's email address
 * @param {string} subject - Email subject
 * @param {string} htmlMessage - Email body in HTML format
 * @returns {Promise<string>} Result message
 */
exports.sendMail = async (to, subject, htmlMessage) => {
  try {
    console.log('Creating email transporter...');
    const transporter = createTransporter();
    
    console.log('Setting up email options...');
    const mailOptions = {
      from: 'khadijahouda70@gmail.com',
      to: to,
      subject: subject,
      html: htmlMessage
    };

    console.log('Sending email...');
    const info = await transporter.sendMail(mailOptions);
    
    console.log('Email sent successfully:', info.response);
    return 'Email sent successfully';
  } catch (error) {
    console.error('Error sending email:', error);
    return `Failed to send email: ${error.message}`;
  }
};

/**
 * Send a contact form email
 * 
 * @param {object} contactData - Contact form data
 * @returns {Promise<string>} Result message
 */
exports.sendContactEmail = async (contactData) => {
  const { fName, lName, phone, email, message } = contactData;

  // Input validation
  if (!fName || !lName || !phone || !email || !message) {
    throw new Error('All contact form fields are required');
  }

  try {
    // Create content for contact form submission
    const content = `
      <p><strong>First Name:</strong> ${fName}</p>
      <p><strong>Last Name:</strong> ${lName}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Email:</strong> ${email}</p>
      <div style="margin-top: 15px; padding: 15px; background-color: #f9f9f9; border-radius: 4px;">
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-line;">${message}</p>
      </div>
    `;
    
    return exports.sendTemplatedEmail(
      'your-recipient-email@example.com', // Change this to your actual recipient
      'New Contact Form Submission',
      'New Contact Form Submission', 
      content,
      { headerTextColor: '#333333' }
    );
  } catch (error) {
    console.error('Error sending contact email:', error);
    throw new Error('Error sending contact form');
  }
};

/**
 * Send a password reset OTP
 * 
 * @param {string} to - User's email
 * @param {string} otp - One-time password
 * @returns {Promise<string>} Result message
 */
exports.sendPasswordResetOTP = async (to, otp) => {
  // Create content for password reset
  const content = `
    <div style="text-align: center; padding: 20px; background-color: #f9f9f9; border-radius: 8px; margin-bottom: 20px;">
      <p style="font-size: 16px; margin-bottom: 15px;">You requested a password reset for your account.</p>
      <div style="background-color: #ffffff; display: inline-block; padding: 12px 24px; border-radius: 4px; border: 1px solid #ddd; margin: 10px 0;">
        <span style="font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #d9534f;">${otp}</span>
      </div>
      <p style="font-size: 14px; color: #666; margin-top: 15px;">This code will expire in 10 minutes</p>
    </div>
    
    <p>If you didn't request this reset, please ignore this email or contact our support team if you believe this is suspicious activity.</p>
    
    <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #eee;">
      <p style="font-size: 12px; color: #777;">For security reasons, never share this code with anyone.</p>
    </div>
  `;
  
  return exports.sendTemplatedEmail(
    to,
    'Password Reset OTP',
    'Password Reset Request',
    content,
    { 
      headerBgColor: '#d9534f',  // Red background
      headerTextColor: '#ffffff', // White text
      additionalFooterText: 'If you did not request this password reset, please disregard this email.'
    }
  );
};

/**
 * Send order confirmation email
 * 
 * @param {string} to - User's email
 * @param {object} order - Order details
 * @returns {Promise<string>} Result message
 */
exports.sendOrderConfirmation = async (to, order) => {
  try {
    // Format currency for display
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: order.currency || 'USD'
      }).format(amount);
    };
    
    // Generate products table rows
    const productRows = order.products.map(product => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">
          <img src="${product.img}" alt="${product.title}" width="50" height="50" style="max-width: 50px; border-radius: 4px;">
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">
          ${product.title} <br>
          <small>${product.color} / ${product.size}</small>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">
          ${product.quantity}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
          ${formatCurrency(product.price)}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
          ${formatCurrency(product.price * product.quantity)}
        </td>
      </tr>
    `).join('');

    // Create order confirmation content
    const content = `
      <p>Thank you for your purchase!</p>
      
      <h2>Order #${order.orderNumber}</h2>
      <p>Date: ${new Date(order.createdAt).toLocaleDateString()}</p>
      
      <h3>Shipping Information</h3>
      <p>
        ${order.address.street || ''}<br>
        ${order.address.city}, ${order.address.country} ${order.address.zipCode || ''}<br>
        Phone: ${order.address.phone || 'Not provided'}
      </p>
      
      <h3>Order Summary</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f8f9fa;">
            <th style="padding: 12px; text-align: left;">Product</th>
            <th style="padding: 12px; text-align: left;">Details</th>
            <th style="padding: 12px; text-align: center;">Qty</th>
            <th style="padding: 12px; text-align: right;">Unit Price</th>
            <th style="padding: 12px; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${productRows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="padding: 12px; text-align: right;"><strong>Subtotal:</strong></td>
            <td style="padding: 12px; text-align: right;">${formatCurrency(order.subtotal)}</td>
          </tr>
          <tr>
            <td colspan="4" style="padding: 12px; text-align: right;"><strong>Shipping:</strong></td>
            <td style="padding: 12px; text-align: right;">${formatCurrency(order.shippingCost)}</td>
          </tr>
          <tr>
            <td colspan="4" style="padding: 12px; text-align: right;"><strong>Tax:</strong></td>
            <td style="padding: 12px; text-align: right;">${formatCurrency(order.tax)}</td>
          </tr>
          ${order.discount > 0 ? `
          <tr>
            <td colspan="4" style="padding: 12px; text-align: right;"><strong>Discount:</strong></td>
            <td style="padding: 12px; text-align: right;">-${formatCurrency(order.discount)}</td>
          </tr>
          ` : ''}
          <tr>
            <td colspan="4" style="padding: 12px; text-align: right;"><strong>Total:</strong></td>
            <td style="padding: 12px; text-align: right; font-weight: bold; font-size: 1.2em;">
              ${formatCurrency(order.amount)}
            </td>
          </tr>
        </tfoot>
      </table>
      
      <div style="margin-top: 30px;">
        <p>Your order is currently <strong>${order.status}</strong>. We'll notify you when it ships.</p>
        <p>If you have any questions about your order, please contact our customer support team.</p>
      </div>
    `;

    return exports.sendTemplatedEmail(
      to,
      `Order Confirmation #${order.orderNumber}`,
      'Order Confirmation',
      content,
      { 
        headerTextColor: '#5c6ac4',
        additionalFooterText: `Order #${order.orderNumber} | ${new Date(order.createdAt).toLocaleDateString()}`
      }
    );
  } catch (error) {
    console.error('Error creating order confirmation email:', error);
    return `Failed to send order confirmation: ${error.message}`;
  }
};

/**
 * Send a reminder for items saved for later
 * 
 * @param {string} to - User's email address
 * @param {Array} savedProducts - Array of saved product objects
 * @param {string} userName - User's name for personalization
 * @returns {Promise<string>} Result message
 */
exports.sendSavedItemsReminder = async (to, savedProducts, userName = '') => {
  try {
    // Format currency for display
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(amount || 0);
    };

    // Generate product cards HTML
    const productCards = savedProducts.map(product => `
      <div style="margin-bottom: 20px; border: 1px solid #eee; border-radius: 8px; overflow: hidden; width: 100%; max-width: 280px; display: inline-block; margin-right: 15px; vertical-align: top; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="height: 180px; overflow: hidden; background-color: #f9f9f9; display: flex; align-items: center; justify-content: center;">
          <img src="${product.img || 'https://via.placeholder.com/250x180?text=Product+Image'}" 
               alt="${product.title}" 
               style="width: 100%; height: auto; object-fit: cover;">
        </div>
        <div style="padding: 15px;">
          <h3 style="margin-top: 0; margin-bottom: 10px; color: #333; font-size: 16px; font-weight: 600;">
            ${product.title}
          </h3>
          <p style="color: #666; margin-bottom: 10px; font-size: 13px; line-height: 1.4; height: 55px; overflow: hidden;">
            ${(product.desc || '').substring(0, 120)}${(product.desc || '').length > 120 ? '...' : ''}
          </p>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="font-weight: 600; color: #e63946; font-size: 15px;">
              ${formatCurrency(product.price)}
            </span>
            <span style="font-size: 12px; color: #888;">
              ${product.color ? product.color : ''}
              ${product.color && product.size ? ' / ' : ''}
              ${product.size ? product.size : ''}
            </span>
          </div>
          <a href="https://yourdomain.com/product/${product._id}" 
             style="display: block; text-align: center; background-color: #0077cc; color: white; padding: 10px; border-radius: 4px; text-decoration: none; font-weight: 500; font-size: 14px; transition: background-color 0.2s;">
            View Product
          </a>
        </div>
      </div>
    `).join('');

    // Create saved items reminder content
    const content = `
      <p style="font-size: 16px; color: #333;">Hello ${userName || 'there'},</p>
      <p style="font-size: 16px; color: #333; margin-bottom: 25px;">We noticed you saved ${savedProducts.length > 1 ? 'some items' : 'an item'} for later. Here's a reminder of what's waiting in your saved list:</p>
      
      <div style="margin: 30px 0; text-align: center; overflow-x: auto; white-space: nowrap; padding: 10px 0;">
        ${productCards}
      </div>
      
      <p style="font-size: 16px; color: #333; margin-top: 20px;">
        ${savedProducts.length > 1 ? 'These items are' : 'This item is'} still available, but inventory is limited. 
        Don't miss out on your saved ${savedProducts.length > 1 ? 'items' : 'item'}!
      </p>
      
      <div style="text-align: center; margin-top: 30px;">
        <a href="https://yourdomain.com/account/saved-items" 
           style="display: inline-block; background-color: #0077cc; color: white; padding: 12px 25px; border-radius: 4px; text-decoration: none; font-weight: bold; font-size: 16px; transition: background-color 0.2s;">
          View All Saved Items
        </a>
      </div>
      
      <p style="font-size: 12px; color: #666; margin-top: 30px; text-align: center;">
        If you prefer not to receive these reminders, please <a href="https://yourdomain.com/account/notifications" style="color: #0077cc;">update your notification preferences</a>.
      </p>
    `;
    
    return exports.sendTemplatedEmail(
      to,
      "Don't miss out on your saved items!",
      'Don\'t Forget Your Saved Items',
      content,
      { 
        headerBgColor: '#0077cc', 
        headerTextColor: '#ffffff'
      }
    );
  } catch (error) {
    console.error('❌ Error sending saved items reminder email:', error);
    throw new Error(`Error sending saved items reminder: ${error.message}`);
  }
};

/**
 * Send a welcome email to new users
 * 
 * @param {string} to - User's email address
 * @param {string} name - User's name
 * @returns {Promise<string>} Result message
 */
exports.sendWelcomeEmail = async (to, name) => {
  const content = `
    <div style="text-align: center; margin-bottom: 25px;">
      <p style="font-size: 18px; margin-bottom: 15px;">Hello ${name || 'there'},</p>
      <p style="font-size: 16px;">Welcome to our store! We're excited to have you join us.</p>
    </div>
    
    <div style="margin: 30px 0; text-align: center;">
      <p>Here are some quick links to help you get started:</p>
      <div style="margin: 20px 0;">
        <a href="https://yourdomain.com/shop" 
           style="display: inline-block; background-color: #5c6ac4; color: white; padding: 10px 20px; margin: 0 10px; border-radius: 4px; text-decoration: none; font-weight: 500;">
          Shop Now
        </a>
        <a href="https://yourdomain.com/account" 
           style="display: inline-block; background-color: #5c6ac4; color: white; padding: 10px 20px; margin: 0 10px; border-radius: 4px; text-decoration: none; font-weight: 500;">
          My Account
        </a>
      </div>
    </div>
    
    <p style="margin-top: 30px;">Thank you for creating an account with us. If you have any questions, please don't hesitate to contact our customer support team.</p>
  `;
  
  return exports.sendTemplatedEmail(
    to,
    'Welcome to Our Store!',
    'Welcome to Our Store',
    content,
    { 
      headerBgColor: '#5c6ac4', 
      headerTextColor: '#ffffff',
      additionalFooterText: 'Follow us on social media for updates and special offers!'
    }
  );
};

/**
 * Send a shipping confirmation email
 * 
 * @param {string} to - User's email address
 * @param {object} order - Order details
 * @param {object} shipment - Shipment details
 * @returns {Promise<string>} Result message
 */
exports.sendShippingConfirmation = async (to, order, shipment) => {
  const content = `
    <p>Great news! Your order #${order.orderNumber} has shipped.</p>
    
    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0;">Shipping Details</h3>
      <p><strong>Carrier:</strong> ${shipment.carrier || 'Standard Shipping'}</p>
      <p><strong>Tracking Number:</strong> ${shipment.trackingNumber || 'Not available'}</p>
      ${shipment.trackingUrl ? `
      <p><a href="${shipment.trackingUrl}" style="color: #0077cc; text-decoration: underline;">Track Your Package</a></p>
      ` : ''}
      <p><strong>Estimated Delivery:</strong> ${shipment.estimatedDelivery ? new Date(shipment.estimatedDelivery).toLocaleDateString() : 'Not available'}</p>
    </div>
    
    <p>Your order contains ${order.products.length} item${order.products.length > 1 ? 's' : ''}.</p>
    
    <p>If you have any questions about your shipment, please contact our customer support team.</p>
  `;
  
  return exports.sendTemplatedEmail(
    to,
    `Your Order #${order.orderNumber} Has Shipped`,
    'Your Order Has Shipped',
    content,
    { 
      headerTextColor: '#28a745',
      additionalFooterText: `Order #${order.orderNumber} | Shipped on ${new Date().toLocaleDateString()}`
    }
  );
};

/**
 * Mock email sender for development
 */
exports.mockSendMail = async (to, subject, htmlMessage) => {
  console.log('========== MOCK EMAIL ==========');
  console.log('To:', to);
  console.log('Subject:', subject);
  console.log('HTML Message:', htmlMessage);
  console.log('================================');
  
  return 'Mock email logged (not actually sent)';
};