// Make sure you're using the correct path to your module
const mailSender = require('./helpers/email_sender');

// Test function for email sender
async function testEmailSending() {
  console.log('Starting email test...');
  
  try {
    // Test password reset OTP
    console.log('\nTesting password reset OTP email...');
    const otpResult = await mailSender.sendPasswordResetOTP(
      'khadijahouda70@gmail.com',
      '5771'
    );
    console.log('Password reset email result:', otpResult);
    
    // Test contact form
    console.log('\nTesting contact form email...');
    const contactResult = await mailSender.sendContactEmail({
      fName: 'Test',
      lName: 'User',
      phone: '123-456-7890',
      email: 'test@example.com',
      message: 'This is a test message from the contact form.'
    });
    console.log('Contact form email result:', contactResult);
    
    // Test mock email function
    console.log('\nTesting mock email sending...');
    const mockResult = await mailSender.mockSendMail(
      'test@example.com',
      'Mock Email Test',
      '<h1>Mock Email</h1><p>This is a mock email for testing.</p>'
    );
    console.log('Mock email result:', mockResult);
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

// Run the test
testEmailSending().then(() => {
  console.log('Test completed');
}).catch(err => {
  console.error('Unhandled error in test:', err);
});