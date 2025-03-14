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
  // You can try different services here:
  
  // For Gmail:
  return nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user:  'khadijahouda70@gmail.com', 
      pass: 'evslegjnlovlbhaj'
    },
    tls: {
      rejectUnauthorized: false // Fix for self-signed certificate error
    }
  });
  
  // Alternative: For AWS SES (like in the GitHub code):
  /*
  return nodemailer.createTransport({
    host: 'smtp.mail.us-east-1.awsapps.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  */
};

/**
 * Send an email
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
 * Similar to the GitHub example
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
    const transporter = createTransporter();

    const mailOptions = {
      from:'khadijahouda70@gmail.com',
      to:  'khadijahouda70@gmail.com', // Where to send contact form submissions
      subject: 'New Contact Form Submission',
      html: `
        <h1>New Contact Form Submission</h1>
        <p><strong>First Name:</strong> ${fName}</p>
        <p><strong>Last Name:</strong> ${lName}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong> ${message}</p>
      `
    };

    await transporter.sendMail(mailOptions);
    return 'Contact form submitted successfully';
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
  return exports.sendMail(
    to,
    'Password Reset OTP',
    `
    <h1>Password Reset Request</h1>
    <p>You requested a password reset for your account.</p>
    <p>Your OTP code is: <strong>${otp}</strong></p>
    <p>This code will expire in 10 minutes.</p>
    <p>If you didn't request this reset, please ignore this email.</p>
    `
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