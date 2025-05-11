const express = require('express');
const router = express.Router();
const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');
const Order = require('../models/order');
const Cart = require('../models/cart');
const mongoose = require('mongoose');
const util = require('util'); // For better error logging
const paypalService = require('./paypal'); // Import PayPal service functions

// Create a separate raw body parser for webhook only
const rawBodyParser = express.raw({type: 'application/json'});

// Use the imported PayPal utility functions
const paypalClient = paypalService.client;
const getCountryCode = paypalService.getCountryCode;
/**
 * Get all orders with details
 * Fetches all orders with their complete details, with optional filtering
 */
router.get('/', async (req, res) => {
    console.log('📦 API CALL: GET /orders');
    try {
        // Extract query parameters for filtering
        const { userId, status, startDate, endDate, limit, page } = req.query;
        
        // Build query object
        const query = {};
        
        // Add filters if provided
        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            query.userId = userId;
        }
        
        if (status) {
            query.status = status;
        }
        
        // Date range filter
        if (startDate || endDate) {
            query.createdAt = {};
            
            if (startDate) {
                query.createdAt.$gte = new Date(startDate);
            }
            
            if (endDate) {
                query.createdAt.$lte = new Date(endDate);
            }
        }
        
        console.log(`🔍 Fetching orders with filters:`, query);
        
        // Set up pagination
        const pageSize = parseInt(limit) || 10;
        const currentPage = parseInt(page) || 1;
        const skip = (currentPage - 1) * pageSize;
        
        // Find orders with pagination
        const orders = await Order.find(query)
            .populate('userId', 'name email phone') // Populate user data directly
            .sort({ createdAt: -1 }) // Sort by newest first
            .skip(skip)
            .limit(pageSize);
            
        // Get total count for pagination
        const totalOrders = await Order.countDocuments(query);
        
        console.log(`✅ Found ${orders.length} orders out of ${totalOrders} total matching orders`);
        
        return res.status(200).json({
            success: true,
            count: orders.length,
            total: totalOrders,
            page: currentPage,
            pages: Math.ceil(totalOrders / pageSize),
            data: orders
        });
    } catch (error) {
        console.error(`❌ Error fetching orders:`, error);
        return res.status(500).json({
            success: false,
            message: "Error fetching orders",
            error: error.message
        });
    }
});

/**
 * Get order by ID
 * Fetches a single order with complete details
 */
router.get('/:id', async (req, res) => {
    console.log(`📦 API CALL: GET /orders/${req.params.id}`);
    
    try {
        const orderId = req.params.id;
        
        // Validate ID format
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID format"
            });
        }
        
        // Find the order
        const order = await Order.findById(orderId);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }
        
        console.log(`✅ Found order: ${order._id}`);
        
        return res.status(200).json({
            success: true,
            data: order
        });
    } catch (error) {
        console.error(`❌ Error fetching order:`, error);
        return res.status(500).json({
            success: false,
            message: "Error fetching order",
            error: error.message
        });
    }
});
/**
 * Handle return from PayPal
 * This endpoint handles users returning from PayPal after approving/canceling payment
 */
router.get('/handle-return', async (req, res) => {
    console.log('📦 API CALL: /handle-return');
    console.log('📦 Query params:', JSON.stringify(req.query, null, 2));
    
    try {
        // Get parameters from the query string
        const { token: paypalOrderId, PayerID, tempOrderRef, orderId } = req.query;
        
        console.log('🔍 DEBUG: PayPal return parameters', { 
            paypalOrderId, 
            PayerID, 
            tempOrderRef, 
            orderId 
        });
        
        if (!paypalOrderId) {
            console.log('❌ Missing PayPal order ID');
            return res.status(400).send(`
                <html>
                <head>
                    <title>Payment Error</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
                        .error { color: red; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1 class="error">Payment Error</h1>
                        <p>Missing PayPal order ID. The payment could not be processed.</p>
                    </div>
                </body>
                </html>
            `);
        }
        
        // Log the return for debugging purposes
        console.log(`🔍 User returned from PayPal with order ID: ${paypalOrderId}`);
        console.log(`🔍 Payer ID: ${PayerID || 'Not provided'}`);
        console.log(`🔍 Temp order reference: ${tempOrderRef || 'Not provided'}`);
        console.log(`🔍 Order ID from query: ${orderId || 'Not provided'}`);
        
        // Check if we can find our database order related to this PayPal order
        if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
            console.log(`🔍 Looking up order in database by ID: ${orderId}`);
            const dbOrder = await Order.findById(orderId);
            if (dbOrder) {
                console.log(`✅ Found order in database: ${dbOrder._id}, Status: ${dbOrder.status}, Paid: ${dbOrder.isPaid || false}`);
            } else {
                console.log(`❌ Order not found in database with ID: ${orderId}`);
            }
        }
        
        // Check PayPal order status
        console.log(`📡 Checking PayPal order status...`);
        let orderDetails;
        try {
            const getOrderRequest = new checkoutNodeJssdk.orders.OrdersGetRequest(paypalOrderId);
            orderDetails = await paypalClient().execute(getOrderRequest);
            console.log(`✅ PayPal order status: ${orderDetails.result.status}`);
            console.log(`📊 PayPal order details:`, JSON.stringify({
                id: orderDetails.result.id,
                status: orderDetails.result.status,
                intent: orderDetails.result.intent,
                createTime: orderDetails.result.create_time,
                updateTime: orderDetails.result.update_time,
                purchaseUnits: orderDetails.result.purchase_units?.map(unit => ({
                    referenceId: unit.reference_id,
                    customId: unit.custom_id
                }))
            }, null, 2));
        } catch (err) {
            console.error(`❌ Error getting order details from PayPal:`, err);
            return res.status(500).send(`
                <html>
                <head>
                    <title>Payment Error</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
                        .error { color: red; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1 class="error">Payment Error</h1>
                        <p>Error verifying payment with PayPal: ${err.message}</p>
                    </div>
                </body>
                </html>
            `);
        }
        
        // Now that we've verified the order with PayPal directly, attempt to capture the payment
        if (orderDetails.result.status === 'APPROVED') {
            console.log(`✅ Order is approved, attempting server-side capture...`);
            try {
                // Create capture request
                const request = new checkoutNodeJssdk.orders.OrdersCaptureRequest(paypalOrderId);
                request.requestBody({});
                
                // Call PayPal to capture the payment
                console.log(`📡 Executing capture request to PayPal...`);
                const capture = await paypalClient().execute(request);
                console.log(`💰 Payment captured successfully! Status: ${capture.result.status}`);
                console.log(`📊 Capture details:`, JSON.stringify({
                    id: capture.result.id,
                    status: capture.result.status,
                    createTime: capture.result.create_time,
                    updateTime: capture.result.update_time,
                    captureId: capture.result.purchase_units?.[0]?.payments?.captures?.[0]?.id || 'Not available'
                }, null, 2));
                
                // Update our order in the database if we have the orderId
                if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
                    console.log(`📝 Updating order ${orderId} with payment details...`);
                    
                    try {
                        const dbOrder = await Order.findById(orderId);
                        
                        if (dbOrder) {
                            const captureId = capture.result.purchase_units[0].payments.captures[0].id;
                            const captureStatus = capture.result.status;
                            
                            dbOrder.paymentDetails = {
                                ...dbOrder.paymentDetails,
                                status: captureStatus,
                                captureId: captureId,
                                capturedAt: new Date(),
                                paymentData: capture.result
                            };
                            
                            // Update order status based on payment result
                            if (captureStatus === "COMPLETED") {
                                dbOrder.status = "processing";
                                dbOrder.statusHistory.push({
                                    status: "processing",
                                    timestamp: new Date(),
                                    note: "Payment completed via PayPal handle-return"
                                });
                                dbOrder.isPaid = true;
                                dbOrder.paidAt = new Date();
                                
                                console.log(`💰 Payment successful for order ${dbOrder._id}`);
                            }
                            
                            await dbOrder.save();
                            console.log(`✅ Order ${dbOrder._id} updated with payment details`);
                        } else {
                            console.log(`⚠️ Could not find order to update: ${orderId}`);
                        }
                    } catch (updateError) {
                        console.error(`❌ Error updating order with payment details:`, updateError);
                        // Continue to show success page even if updating our DB fails
                    }
                }
                
                // Return a success page directly
                return res.status(200).send(`
                    <html>
                    <head>
                        <title>Payment Successful</title>
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
                            .success { color: green; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .order-info { background: #f8f8f8; padding: 20px; border-radius: 5px; margin-top: 20px; }
                        </style>
                        <script>
                            // Send message to parent window that payment is complete
                            window.onload = function() {
                                if (window.opener) {
                                    try {
                                        window.opener.postMessage({ 
                                            type: 'PAYMENT_SUCCESS',
                                            paypalOrderId: '${paypalOrderId}',
                                            orderId: '${orderId || ''}',
                                            status: '${capture.result.status}'
                                        }, '*');
                                        console.log('Sent success message to parent window');
                                    } catch(e) {
                                        console.error('Failed to notify parent window:', e);
                                    }
                                }
                            };
                        </script>
                    </head>
                    <body>
                        <div class="container">
                            <h1 class="success">Payment Successful!</h1>
                            <p>Your payment has been processed successfully.</p>
                            <div class="order-info">
                                <p><strong>PayPal Order ID:</strong> ${paypalOrderId}</p>
                                <p><strong>Status:</strong> ${capture.result.status}</p>
                                <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                            </div>
                            <p>Thank you for your purchase!</p>
                            <p>This window will close automatically in 5 seconds...</p>
                        </div>
                        <script>
                            // Close this window after 5 seconds
                            setTimeout(function() {
                                if (window.opener) {
                                    window.close();
                                } else {
                                    window.location.href = '${process.env.FRONTEND_URL || '/'}';
                                }
                            }, 5000);
                        </script>
                    </body>
                    </html>
                `);
            } catch (captureError) {
                console.error(`⚠️ Capture failed, but order is approved:`, captureError);
                console.error(`⚠️ Error details:`, util.inspect(captureError, { depth: 3, colors: true }));
                
                // Special handling for already captured orders
                const errorDetails = captureError.toString().toLowerCase();
                if (errorDetails.includes('already captured') || 
                    captureError.statusCode === 422) {
                    console.log(`ℹ️ This appears to be an already captured order`);
                    
                    // Check if our database has this order already
                    try {
                        const existingOrder = await Order.findOne({
                            "paymentDetails.paypalOrderId": paypalOrderId
                        });
                        
                        if (existingOrder) {
                            console.log(`✅ Found existing order in database: ${existingOrder._id}`);
                            console.log(`📊 Order status: ${existingOrder.status}, Paid: ${existingOrder.isPaid || false}`);
                            
                            // Update if needed
                            if (!existingOrder.isPaid) {
                                existingOrder.isPaid = true;
                                existingOrder.paidAt = new Date();
                                existingOrder.status = "processing";
                                existingOrder.statusHistory.push({
                                    status: "processing",
                                    timestamp: new Date(),
                                    note: "Payment marked as completed (was already captured)"
                                });
                                await existingOrder.save();
                                console.log(`✅ Updated existing order ${existingOrder._id} to paid status`);
                            }
                        }
                    } catch (findError) {
                        console.error(`❌ Error finding existing order:`, findError);
                    }
                    
                    // Return success page for already captured orders
                    return res.status(200).send(`
                        <html>
                        <head>
                            <title>Payment Successful</title>
                            <style>
                                body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
                                .success { color: green; }
                                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                                .order-info { background: #f8f8f8; padding: 20px; border-radius: 5px; margin-top: 20px; }
                            </style>
                            <script>
                                // Send message to parent window that payment is complete
                                window.onload = function() {
                                    if (window.opener) {
                                        try {
                                            window.opener.postMessage({ 
                                                type: 'PAYMENT_SUCCESS',
                                                paypalOrderId: '${paypalOrderId}',
                                                orderId: '${orderId || ''}',
                                                status: 'COMPLETED'
                                            }, '*');
                                            console.log('Sent success message to parent window');
                                        } catch(e) {
                                            console.error('Failed to notify parent window:', e);
                                        }
                                    }
                                };
                            </script>
                        </head>
                        <body>
                            <div class="container">
                                <h1 class="success">Payment Successful!</h1>
                                <p>Your payment has been processed successfully.</p>
                                <div class="order-info">
                                    <p><strong>PayPal Order ID:</strong> ${paypalOrderId}</p>
                                    <p><strong>Status:</strong> COMPLETED</p>
                                    <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                                </div>
                                <p>Thank you for your purchase!</p>
                                <p>This window will close automatically in 5 seconds...</p>
                            </div>
                            <script>
                                // Close this window after 5 seconds
                                setTimeout(function() {
                                    if (window.opener) {
                                        window.close();
                                    } else {
                                        window.location.href = '${process.env.FRONTEND_URL || '/'}';
                                    }
                                }, 5000);
                            </script>
                        </body>
                        </html>
                    `);
                }
                
                // Return a partial success with notification about the capture issue
                return res.status(200).send(`
                    <html>
                    <head>
                        <title>Payment Approved</title>
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
                            .success { color: green; }
                            .warning { color: orange; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .order-info { background: #f8f8f8; padding: 20px; border-radius: 5px; margin-top: 20px; }
                            .error-details { background: #fff8f8; padding: 10px; border: 1px solid #ffeeee; border-radius: 5px; margin-top: 20px; font-size: 12px; text-align: left; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1 class="success">Payment Approved</h1>
                            <p class="warning">Your payment was approved, but we encountered an issue finalizing it.</p>
                            <p>Our team has been notified and will ensure your order is processed correctly.</p>
                            <div class="order-info">
                                <p><strong>PayPal Order ID:</strong> ${paypalOrderId}</p>
                                <p><strong>Status:</strong> ${orderDetails.result.status}</p>
                                <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                            </div>
                            <p>Thank you for your purchase!</p>
                            <p>This page will redirect in 10 seconds...</p>
                            <div class="error-details">
                                <p>Error: ${captureError.message || 'Unknown error'}</p>
                            </div>
                        </div>
                        <script>
                            // Redirect after 10 seconds
                            setTimeout(function() {
                                window.location.href = '${process.env.FRONTEND_URL || '/'}';
                            }, 10000);
                        </script>
                    </body>
                    </html>
                `);
            }
        } else if (orderDetails.result.status === 'COMPLETED') {
            // Order already completed - just show success
            console.log(`ℹ️ Order already completed, showing success page`);
            
            // Try to update our order database record
            if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
                try {
                    const dbOrder = await Order.findById(orderId);
                    if (dbOrder && !dbOrder.isPaid) {
                        dbOrder.isPaid = true;
                        dbOrder.paidAt = new Date();
                        dbOrder.status = "processing";
                        dbOrder.statusHistory.push({
                            status: "processing",
                            timestamp: new Date(),
                            note: "Payment status confirmed as COMPLETED from PayPal"
                        });
                        await dbOrder.save();
                        console.log(`✅ Updated order ${dbOrder._id} to paid status based on COMPLETED PayPal status`);
                    }
                } catch (updateError) {
                    console.error(`❌ Error updating order database for completed payment:`, updateError);
                }
            }
            
            return res.status(200).send(`
                <html>
                <head>
                    <title>Payment Successful</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
                        .success { color: green; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .order-info { background: #f8f8f8; padding: 20px; border-radius: 5px; margin-top: 20px; }
                    </style>
                    <script>
                        // Send message to parent window that payment is complete
                        window.onload = function() {
                            if (window.opener) {
                                try {
                                    window.opener.postMessage({ 
                                        type: 'PAYMENT_SUCCESS',
                                        paypalOrderId: '${paypalOrderId}',
                                        orderId: '${orderId || ''}',
                                        status: 'COMPLETED'
                                    }, '*');
                                    console.log('Sent success message to parent window');
                                } catch(e) {
                                    console.error('Failed to notify parent window:', e);
                                }
                            }
                        };
                    </script>
                </head>
                <body>
                    <div class="container">
                        <h1 class="success">Payment Successful!</h1>
                        <p>Your payment has been processed successfully.</p>
                        <div class="order-info">
                            <p><strong>PayPal Order ID:</strong> ${paypalOrderId}</p>
                            <p><strong>Status:</strong> ${orderDetails.result.status}</p>
                            <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                        </div>
                        <p>Thank you for your purchase!</p>
                        <p>This window will close automatically in 5 seconds...</p>
                    </div>
                    <script>
                        // Close this window after 5 seconds
                        setTimeout(function() {
                            if (window.opener) {
                                window.close();
                            } else {
                                window.location.href = '${process.env.FRONTEND_URL || '/'}';
                            }
                        }, 5000);
                    </script>
                </body>
                </html>
            `);
        } else {
            // Order in an unexpected state
            console.log(`⚠️ Order in unexpected state: ${orderDetails.result.status}`);
            
            return res.status(400).send(`
                <html>
                <head>
                    <title>Payment Status</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
                        .warning { color: orange; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .order-info { background: #f8f8f8; padding: 20px; border-radius: 5px; margin-top: 20px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1 class="warning">Payment In Progress</h1>
                        <p>Your payment is being processed. Current status: ${orderDetails.result.status}</p>
                        <div class="order-info">
                            <p><strong>PayPal Order ID:</strong> ${paypalOrderId}</p>
                            <p><strong>Status:</strong> ${orderDetails.result.status}</p>
                            <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                        </div>
                        <p>Please check your email for confirmation.</p>
                    </div>
                </body>
                </html>
            `);
        }
    } catch (error) {
        console.error(`❌ Error handling PayPal return:`, error);
        console.error(util.inspect(error, { depth: 3, colors: true }));
        
        return res.status(500).send(`
            <html>
            <head>
                <title>Payment Error</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
                    .error { color: red; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .error-details { background: #fff8f8; padding: 10px; border: 1px solid #ffeeee; border-radius: 5px; margin-top: 20px; font-size: 12px; text-align: left; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1 class="error">Payment Error</h1>
                    <p>There was an error processing your payment: ${error.message}</p>
                    <p>Please contact customer support if you believe this is an error.</p>
                    <div class="error-details">
                        <p>Error: ${error.message}</p>
                        <p>PayPal Order ID: ${paypalOrderId || 'Not available'}</p>
                        <p>Time: ${new Date().toLocaleString()}</p>
                    </div>
                </div>
            </body>
            </html>
        `);
    }
});

/**
 * PayPal webhook endpoint - FIXED with enhanced logging
 */
router.post('/webhook', rawBodyParser, async (req, res) => {
    console.log('📣 PayPal webhook received');
    console.log('📣 Headers:', JSON.stringify(req.headers, null, 2));
    
    try {
        // Parse the raw body
        let payload;
        let rawBody;
        
        try {
            if (req.body) {
                if (typeof req.body === 'string' || req.body instanceof Buffer) {
                    rawBody = req.body.toString('utf8');
                    console.log('📣 Raw webhook body:', rawBody.substring(0, 200) + '...');
                    payload = JSON.parse(rawBody);
                } else {
                    // Already parsed as object
                    payload = req.body;
                    console.log('📣 Webhook body (already parsed):', JSON.stringify(payload).substring(0, 200) + '...');
                }
            } else {
                console.error('❌ No req.body in webhook request!');
                return res.status(400).json({ error: 'No payload received' });
            }
        } catch (parseError) {
            console.error('❌ Failed to parse webhook payload:', parseError);
            console.error('❌ Raw body:', typeof req.body, req.body ? req.body.length : 'N/A');
            return res.status(400).json({ error: 'Invalid payload format' });
        }
        
        // Verify webhook payload
        if (!payload || !payload.event_type) {
            console.error('❌ Invalid webhook payload structure');
            return res.status(400).json({ error: 'Invalid webhook format' });
        }
        
        // Handle different event types
        const eventType = payload.event_type;
        
        console.log(`📣 PayPal webhook type: ${eventType}`);
        console.log(`📣 PayPal webhook ID: ${payload.id}`);
        console.log(`📣 PayPal webhook time: ${payload.create_time}`);
        
        // Log key resource details
        if (payload.resource) {
            console.log(`📣 Resource ID: ${payload.resource.id || 'N/A'}`);
            console.log(`📣 Resource status: ${payload.resource.status || 'N/A'}`);
            
            // For capture events
            if (payload.resource.supplementary_data?.related_ids) {
                console.log(`📣 Related order ID: ${payload.resource.supplementary_data.related_ids.order_id || 'N/A'}`);
            }
        }
        
        switch (eventType) {
            case 'PAYMENT.CAPTURE.COMPLETED':
                console.log(`💰 Payment capture completed webhook`);
                
                // Extract IDs from the payload
                const paymentId = payload.resource.id;
                const paypalOrderId = payload.resource.supplementary_data?.related_ids?.order_id;
                
                console.log(`📝 Payment ID: ${paymentId}`);
                console.log(`📝 Related PayPal Order ID: ${paypalOrderId || 'Not available'}`);
                
                if (!paypalOrderId) {
                    console.error('❌ No order ID in webhook payload - trying to extract from custom fields');
                    
                    // Log extra fields for debugging
                    console.log('📝 Available resource fields:', Object.keys(payload.resource));
                    
                    // Check for custom ID fields that might contain our reference
                    if (payload.resource.custom_id) {
                        console.log(`📝 Found custom_id: ${payload.resource.custom_id}`);
                    }
                    
                    if (payload.resource.invoice_id) {
                        console.log(`📝 Found invoice_id: ${payload.resource.invoice_id}`);
                    }
                    
                    // Try to find an order with this payment ID directly
                    try {
                        const orderByCapture = await Order.findOne({ "paymentDetails.captureId": paymentId });
                        if (orderByCapture) {
                            console.log(`✅ Found order by capture ID: ${orderByCapture._id}`);
                            // Update order if needed - it might already be processed
                            if (!orderByCapture.isPaid) {
                                console.log(`📝 Updating order with capture ID ${paymentId} to paid status`);
                                orderByCapture.isPaid = true;
                                orderByCapture.paidAt = new Date();
                                orderByCapture.status = "processing";
                                orderByCapture.statusHistory.push({
                                    status: "processing",
                                    timestamp: new Date(),
                                    note: "Payment confirmed by PayPal webhook (by capture ID)"
                                });
                                await orderByCapture.save();
                                console.log(`✅ Order updated successfully`);
                            } else {
                                console.log(`ℹ️ Order already marked as paid, no update needed`);
                            }
                        } else {
                            console.log(`ℹ️ No order found with capture ID: ${paymentId}`);
                        }
                    } catch (err) {
                        console.error(`❌ Error looking up order by capture ID:`, err);
                    }
                    
                    break;
                }
                
                // Find the order in our database
                console.log(`🔍 Looking up order by PayPal ID: ${paypalOrderId}`);
                const order = await Order.findOne({ "paymentDetails.paypalOrderId": paypalOrderId });
                
                if (!order) {
                    console.error(`❌ Order not found for PayPal ID: ${paypalOrderId}`);
                    break;
                }
                
                console.log(`✅ Found order: ${order._id}`);
                console.log(`📊 Current order status: ${order.status}, isPaid: ${order.isPaid || false}`);
                
                // Update order payment status if not already paid
                if (!order.isPaid) {
                    console.log(`📝 Updating order payment status to paid`);
                    
                    order.isPaid = true;
                    order.paidAt = new Date();
                    order.status = "processing";
                    order.statusHistory.push({
                        status: "processing",
                        timestamp: new Date(),
                        note: "Payment confirmed by PayPal webhook"
                    });
                    
                    // Update capture ID if available
                    if (paymentId && (!order.paymentDetails.captureId || order.paymentDetails.captureId !== paymentId)) {
                        console.log(`📝 Updating capture ID to: ${paymentId}`);
                        order.paymentDetails = {
                            ...order.paymentDetails,
                            captureId: paymentId,
                            status: "COMPLETED",
                            capturedAt: new Date()
                        };
                    }
                    
                    await order.save();
                    console.log(`✅ Order ${order._id} marked as paid via webhook`);
                } else {
                    console.log(`ℹ️ Order already marked as paid, no update needed`);
                }
                break;
                
            // Handle other event types with detailed logging
            case 'CHECKOUT.ORDER.APPROVED':
                console.log(`👍 Order approved webhook`);
                
                // Log detailed information
                if (payload.resource && payload.resource.id) {
                    const paypalOrderId = payload.resource.id;
                    console.log(`📝 PayPal Order ID: ${paypalOrderId}`);
                    
                    // Try to find our order
                    const approvedOrder = await Order.findOne({ "paymentDetails.paypalOrderId": paypalOrderId });
                    if (approvedOrder) {
                        console.log(`✅ Found corresponding order: ${approvedOrder._id}`);
                        console.log(`📊 Current status: ${approvedOrder.status}, isPaid: ${approvedOrder.isPaid || false}`);
                        
                        // Update order status to approved if not already
                        if (approvedOrder.status !== "approved" && approvedOrder.status !== "processing") {
                            console.log(`📝 Updating order status to 'approved'`);
                            approvedOrder.status = "approved";
                            approvedOrder.statusHistory.push({
                                status: "approved",
                                timestamp: new Date(),
                                note: "Order approved by buyer via PayPal (webhook notification)"
                            });
                            
                            // Update PayPal details
                            approvedOrder.paymentDetails = {
                                ...approvedOrder.paymentDetails,
                                status: "APPROVED",
                                approvedAt: new Date()
                            };
                            
                            await approvedOrder.save();
                            console.log(`✅ Order ${approvedOrder._id} marked as approved`);
                        } else {
                            console.log(`ℹ️ Order already in appropriate status, no update needed`);
                        }
                    } else {
                        console.log(`ℹ️ No matching order found for PayPal order: ${paypalOrderId}`);
                    }
                }
                break;
                
            case 'CHECKOUT.ORDER.COMPLETED':
                console.log(`✅ Order completed webhook`);
                
                // Extract PayPal order ID
                if (payload.resource && payload.resource.id) {
                    const paypalOrderId = payload.resource.id;
                    console.log(`📝 PayPal Order ID: ${paypalOrderId}`);
                    
                    // Try to find and update our order
                    const completedOrder = await Order.findOne({ "paymentDetails.paypalOrderId": paypalOrderId });
                    if (completedOrder) {
                        console.log(`✅ Found corresponding order: ${completedOrder._id}`);
                        console.log(`📊 Current status: ${completedOrder.status}, isPaid: ${completedOrder.isPaid || false}`);
                        
                        // Update order if not already marked as paid
                        if (!completedOrder.isPaid) {
                            console.log(`📝 Updating order as paid from CHECKOUT.ORDER.COMPLETED webhook`);
                            completedOrder.isPaid = true;
                            completedOrder.paidAt = new Date();
                            completedOrder.status = "processing";
                            completedOrder.statusHistory.push({
                                status: "processing",
                                timestamp: new Date(),
                                note: "Payment completed via PayPal (CHECKOUT.ORDER.COMPLETED webhook)"
                            });
                            
                            // Update PayPal status
                            completedOrder.paymentDetails = {
                                ...completedOrder.paymentDetails,
                                status: "COMPLETED"
                            };
                            
                            await completedOrder.save();
                            console.log(`✅ Order ${completedOrder._id} marked as paid`);
                        } else {
                            console.log(`ℹ️ Order already marked as paid, no update needed`);
                        }
                    } else {
                        console.log(`ℹ️ No matching order found for PayPal order: ${paypalOrderId}`);
                    }
                }
                break;
                
            default:
                console.log(`ℹ️ Event type ${eventType} not specifically handled`);
        }
        
        // Always return 200 OK to PayPal for all webhook notifications
        console.log(`📤 Sending 200 OK response to PayPal webhook`);
        res.status(200).json({ received: true });
    } catch (error) {
        console.error(`❌ Error processing webhook:`, error);
        console.error(util.inspect(error, { depth: 3, colors: true }));
        
        // Even for errors, return 200 to PayPal to acknowledge receipt
        // Otherwise PayPal will keep retrying
        res.status(200).json({ received: true, error: error.message });
    }
});

/**
 * Create PayPal Order
 * Endpoint to create a PayPal order for checkout
 */
router.post('/create-order', async (req, res) => {
    try {
        // Validate request
        if (!req.body.orderId) {
            console.log('❌ Missing order ID');
            return res.status(400).json({ 
                success: false,
                message: "Missing order ID"
            });
        }
        
        // Find the order in our database
        const orderId = req.body.orderId;
        console.log(`🔍 Looking up order: ${orderId}`);
        
        let dbOrder;
        try {
            dbOrder = await Order.findById(orderId);
            if (!dbOrder) {
                console.log(`❌ Order not found: ${orderId}`);
                return res.status(404).json({
                    success: false,
                    message: "Order not found"
                });
            }
        } catch (err) {
            console.error(`❌ Error finding order: ${err.message}`);
            return res.status(500).json({
                success: false,
                message: "Error finding order"
            });
        }
        
        // Create PayPal order request
        const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
        request.prefer("return=representation");
        
        // Format order items for PayPal
        const orderItems = dbOrder.products.map(product => {
            return {
                name: product.title || "Product",
                unit_amount: {
                    currency_code: "USD",
                    value: product.price.toFixed(2)
                },
                quantity: product.quantity || 1,
                description: `${product.color || ''} ${product.size || ''}`.trim() || undefined,
                sku: product.productId || undefined,
                category: "PHYSICAL_GOODS"
            };
        });
        
        // Calculate breakdown values
        const itemTotal = dbOrder.subtotal;
        const taxTotal = dbOrder.tax || 0;
        const shippingTotal = dbOrder.shippingCost || 0;
        const discount = dbOrder.discount || 0;
        const orderTotal = dbOrder.amount;
        
        // Get country code in proper ISO 3166-1 alpha-2 format
        const countryCode = getCountryCode(dbOrder.address.country);
        console.log(`🌎 Using country code: ${countryCode} (converted from "${dbOrder.address.country}")`);
        
        // Build the return URL with orderId and total explicitly included
        let returnUrl = req.body.returnUrl || `${process.env.FRONTEND_URL}/checkout/payment`;
        
        // Ensure the return URL is properly formatted
        try {
            // Try to parse as URL and modify
            const completeReturnUrl = new URL(returnUrl);
            
            // Add orderId and total as query parameters
            completeReturnUrl.searchParams.set('orderId', orderId);
            completeReturnUrl.searchParams.set('total', orderTotal.toString());
            
            returnUrl = completeReturnUrl.toString();
            console.log(`🔗 Enhanced return URL: ${returnUrl}`);
        } catch (urlError) {
            // If URL parsing fails, append parameters manually
            console.log(`⚠️ Could not parse return URL, appending parameters manually`);
            
            const separator = returnUrl.includes('?') ? '&' : '?';
            returnUrl = `${returnUrl}${separator}orderId=${orderId}&total=${orderTotal}`;
            console.log(`🔗 Manually created return URL: ${returnUrl}`);
        }
        
        // Do the same for cancel URL
        let cancelUrl = req.body.cancelUrl || `${process.env.FRONTEND_URL}/checkout/cancel`;
        try {
            const completeCancelUrl = new URL(cancelUrl);
            completeCancelUrl.searchParams.set('orderId', orderId);
            cancelUrl = completeCancelUrl.toString();
        } catch (urlError) {
            const separator = cancelUrl.includes('?') ? '&' : '?';
            cancelUrl = `${cancelUrl}${separator}orderId=${orderId}`;
        }
        
        // Set up PayPal order
        request.requestBody({
            intent: "CAPTURE",
            purchase_units: [
                {
                    reference_id: dbOrder._id.toString(),
                    description: `Order #${dbOrder.orderNumber || dbOrder._id.toString()}`,
                    custom_id: orderId, // Include order ID for reference
                    amount: {
                        currency_code: "USD",
                        value: orderTotal.toFixed(2),
                        breakdown: {
                            item_total: {
                                currency_code: "USD",
                                value: itemTotal.toFixed(2)
                            },
                            shipping: {
                                currency_code: "USD",
                                value: shippingTotal.toFixed(2)
                            },
                            tax_total: {
                                currency_code: "USD",
                                value: taxTotal.toFixed(2)
                            },
                            discount: {
                                currency_code: "USD",
                                value: discount.toFixed(2)
                            }
                        }
                    },
                    items: orderItems,
                    shipping: {
                        name: {
                            full_name: `${dbOrder.address.firstName || ''} ${dbOrder.address.lastName || ''}`.trim()
                        },
                        address: {
                            address_line_1: dbOrder.address.street || "",
                            address_line_2: dbOrder.address.address2 || "",
                            admin_area_2: dbOrder.address.city || "",
                            admin_area_1: dbOrder.address.state || "",
                            postal_code: dbOrder.address.zipCode || "",
                            country_code: countryCode
                        }
                    }
                }
            ],
            application_context: {
                shipping_preference: "SET_PROVIDED_ADDRESS",
                user_action: "PAY_NOW",
                return_url: returnUrl,
                cancel_url: cancelUrl
            }
        });
        
        // Call PayPal API to create order
        console.log('📡 Sending request to PayPal...');
        const paypalOrder = await paypalClient().execute(request);
        
        // Find the approval URL in the links array
        const approvalLink = paypalOrder.result.links.find(link => 
            link.rel === "approve" || link.rel === "payer-action"
        ).href;
        
        console.log(`✅ PayPal order created: ${paypalOrder.result.id}`);
        console.log(`👉 Approval URL: ${approvalLink}`);
        
        // Update our order with PayPal ID
        dbOrder.paymentDetails = {
            ...(dbOrder.paymentDetails || {}),
            provider: "PayPal",
            paypalOrderId: paypalOrder.result.id,
            status: "CREATED",
            approvalUrl: approvalLink,  // Store the approval URL
            amount: orderTotal  // Store the amount for reference
        };
        await dbOrder.save();
        
        // Return both order ID and approval URL to the client
        return res.status(200).json({
            success: true,
            paypalOrderId: paypalOrder.result.id,
            approvalUrl: approvalLink,
            orderId: orderId,  // Include the orderId in the response
            amount: orderTotal  // Include the amount in the response
        });
    } catch (error) {
        console.error(`❌ Error creating PayPal order:`, error);
        res.status(500).json({
            success: false,
            message: "Error creating PayPal order", 
            error: error.message
        });
    }
});
/**
 * Create and capture order from cart in one step
 * Creates an order from cart items and immediately processes payment
 */
router.post('/checkout-cart', async (req, res) => {
    console.log('📦 API CALL: /checkout-cart - Combined create and capture in one step');
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        console.log('🔍 Starting one-step checkout process...');
        // Validate request
        const { userId, cartId, cartItems, shippingDetails, returnUrl, cancelUrl, total } = req.body;
        
        console.log(`🔍 Validating request data...`);
        
        if (!userId) {
            console.log('❌ Missing user ID');
            return res.status(400).json({ 
                success: false, 
                message: "Missing user ID" 
            });
        }
        
        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            console.log('❌ Missing or invalid cart items');
            return res.status(400).json({ 
                success: false, 
                message: "Cart items are required" 
            });
        }
        
        if (!shippingDetails) {
            console.log('❌ Missing shipping details');
            return res.status(400).json({ 
                success: false, 
                message: "Shipping details are required" 
            });
        }
        
        // Validate total parameter
        if (total === undefined || total === null || isNaN(parseFloat(total))) {
            console.log('❌ Missing or invalid total amount');
            return res.status(400).json({ 
                success: false, 
                message: "Total amount is required and must be a number" 
            });
        }
        
        // Convert total to a number if it's a string
        const totalAmount = parseFloat(total);
        
        console.log(`✅ Request validation passed`);
        console.log(`🔍 Processing one-step checkout for user: ${userId}`);
        console.log(`📦 Cart contains ${cartItems.length} items`);
        console.log(`💰 Provided total amount: $${totalAmount.toFixed(2)}`);
        console.log(`🛒 Cart ID: ${cartId || 'Not provided'}`);
        
        // Calculate order totals
        console.log(`💰 Calculating order totals...`);
        
        const subtotal = cartItems.reduce((sum, item) => {
            const price = parseFloat(item.price) || 0;
            const quantity = parseInt(item.quantity) || 1;
            console.log(`📊 Item: ${item.title}, Price: $${price}, Quantity: ${quantity}, Total: $${price * quantity}`);
            return sum + (price * quantity);
        }, 0);
        
        // Apply shipping cost (free for orders over $100)
        const shippingCost = subtotal > 100 ? 0 : 9.99;
        console.log(`📊 Shipping cost: $${shippingCost} (${subtotal > 100 ? 'Free shipping applied' : 'Standard shipping'})`);
        
        // Apply tax (7%)
        const tax = subtotal * 0.07;
        console.log(`📊 Tax (7%): $${tax.toFixed(2)}`);
        
        // Calculate final total - compare with provided total for validation
        const calculatedTotal = subtotal + shippingCost + tax;
        console.log(`📊 Calculated total: $${calculatedTotal.toFixed(2)}`);
        
        // Validate that the provided total matches the calculated total (with small tolerance for rounding)
        if (Math.abs(calculatedTotal - totalAmount) > 0.01) {
            console.log(`⚠️ Provided total ($${totalAmount.toFixed(2)}) does not match calculated total ($${calculatedTotal.toFixed(2)})`);
            console.log(`⚠️ Proceeding with calculated total: $${calculatedTotal.toFixed(2)}`);
        }

        // Create a temporary order reference to track this transaction
        const timestamp = Date.now();
        const tempOrderRef = `TEMP-${timestamp}-${userId.substring(0, 8)}`;
        console.log(`📝 Created temporary order reference: ${tempOrderRef}`);

        // Generate order number
        const orderNumber = `ORD-${timestamp.toString().substring(6)}`;
        console.log(`📄 Generated order number: ${orderNumber}`);

        // IMPORTANT: Create an actual order in MongoDB before PayPal interaction
        console.log(`💾 Creating permanent order record in MongoDB database...`);
        
        // Format products for order schema
        console.log(`🔄 Formatting product data for Order schema...`);
        const formattedProducts = cartItems.map(item => {
            console.log(`📦 Processing item: ${item.title || item.name}, price: ${item.price}`);
            return {
                productId: item.productId || item._id || new mongoose.Types.ObjectId(),
                title: item.title || item.name || "Product",
                price: parseFloat(item.price) || 0,
                quantity: parseInt(item.quantity) || 1,
                img: item.img || item.image,
                color: item.color,
                size: item.size
            };
        });
        console.log(`✅ Formatted ${formattedProducts.length} products for order`);

        // Create a new Order document
        console.log(`🏗️ Creating new Order document...`);
        const order = new Order({
            userId: userId,
            orderNumber: orderNumber,
            products: formattedProducts,
            subtotal: subtotal,
            tax: tax,
            shippingCost: shippingCost,
            amount: calculatedTotal, // Use the calculated total for consistency
            status: "pending",
            statusHistory: [{
                status: "pending",
                timestamp: new Date(),
                note: "Order created via one-step checkout, awaiting payment"
            }],
            address: {
                street: shippingDetails.street,
                city: shippingDetails.city,
                country: shippingDetails.country,
                zipCode: shippingDetails.zipCode,
                phone: shippingDetails.phone
            },
            metadata: {
                tempOrderRef: tempOrderRef,
                cartId: cartId // Store the cartId for later deletion
            }
        });
        
        console.log(`💾 About to save order document to database...`);
        // Save the order to get an _id
        try {
            await order.save();
            console.log(`✅ Order successfully created with ID: ${order._id}`);
        } catch (saveError) {
            console.error(`❌ Failed to save order to database:`, saveError);
            throw new Error(`Failed to create order in database: ${saveError.message}`);
        }
        
        // Set up PayPal order with reference to our database order
        console.log(`📡 Creating PayPal order request...`);
        const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
        request.prefer("return=representation");
        
        // Format cart items for PayPal
        console.log(`🧾 Formatting cart items for PayPal...`);
        const paypalItems = cartItems.map(item => {
            console.log(`📊 PayPal item: ${item.title || 'Product'}, Price: ${parseFloat(item.price).toFixed(2)}, Quantity: ${parseInt(item.quantity) || 1}`);
            return {
                name: item.title || item.name || "Product",
                unit_amount: {
                    currency_code: "USD",
                    value: parseFloat(item.price).toFixed(2)
                },
                quantity: parseInt(item.quantity) || 1,
                description: `${item.color || ''} ${item.size || ''}`.trim() || undefined,
                sku: item.productId || item._id || undefined,
                category: "PHYSICAL_GOODS"
            };
        });
        
        // Get country code in proper ISO 3166-1 alpha-2 format
        const countryCode = getCountryCode(shippingDetails.country);
        console.log(`🌎 Using country code: ${countryCode} (converted from "${shippingDetails.country}")`);
        
        // Set up return and cancel URLs with query parameters for toast notifications
        console.log(`🔗 Setting up return/cancel URLs with toast support...`);
        
        // Use the provided returnUrl/cancelUrl or defaults
        let finalReturnUrl = returnUrl || 'http://localhost:3000/checkout/confirmation';
        let finalCancelUrl = cancelUrl || 'http://localhost:3000/checkout/cancel';
        
        // Add toast parameters and order information to the URLs
        try {
            // For return URL (success), add success=true, message and orderId
            const returnUrlObj = new URL(finalReturnUrl);
            returnUrlObj.searchParams.set('success', 'true');
            returnUrlObj.searchParams.set('message', 'Payment successful!');
            returnUrlObj.searchParams.set('toastType', 'success');
            returnUrlObj.searchParams.set('orderId', order._id.toString());
            returnUrlObj.searchParams.set('orderNumber', orderNumber);
            finalReturnUrl = returnUrlObj.toString();
            console.log(`🔗 Configured return URL: ${finalReturnUrl}`);
            
            // For cancel URL, add canceled=true, message and orderId
            const cancelUrlObj = new URL(finalCancelUrl);
            cancelUrlObj.searchParams.set('canceled', 'true');
            cancelUrlObj.searchParams.set('message', 'Payment was canceled');
            cancelUrlObj.searchParams.set('toastType', 'error');
            cancelUrlObj.searchParams.set('orderId', order._id.toString());
            finalCancelUrl = cancelUrlObj.toString();
            console.log(`🔗 Configured cancel URL: ${finalCancelUrl}`);
        } catch (urlError) {
            console.error(`❌ Error formatting URLs:`, urlError);
            // If URL parsing fails, append parameters manually
            finalReturnUrl += finalReturnUrl.includes('?') 
                ? `&success=true&message=Payment%20successful!&toastType=success&orderId=${order._id.toString()}&orderNumber=${orderNumber}` 
                : `?success=true&message=Payment%20successful!&toastType=success&orderId=${order._id.toString()}&orderNumber=${orderNumber}`;
                
            finalCancelUrl += finalCancelUrl.includes('?') 
                ? `&canceled=true&message=Payment%20was%20canceled&toastType=error&orderId=${order._id.toString()}` 
                : `?canceled=true&message=Payment%20was%20canceled&toastType=error&orderId=${order._id.toString()}`;
            
            console.log(`🔗 Manually formatted return URL: ${finalReturnUrl}`);
            console.log(`🔗 Manually formatted cancel URL: ${finalCancelUrl}`);
        }
        
        // Build the PayPal order request body
        console.log(`📝 Building PayPal order request body...`);
        const requestBody = {
            intent: "CAPTURE", // IMPORTANT: Set intent to CAPTURE for immediate payment
            purchase_units: [
                {
                    reference_id: order._id.toString(), // Use our actual order ID
                    description: `Order #${orderNumber}`,
                    custom_id: userId, // Include user ID for reference
                    amount: {
                        currency_code: "USD",
                        value: calculatedTotal.toFixed(2), // Use calculated total
                        breakdown: {
                            item_total: {
                                currency_code: "USD",
                                value: subtotal.toFixed(2)
                            },
                            shipping: {
                                currency_code: "USD",
                                value: shippingCost.toFixed(2)
                            },
                            tax_total: {
                                currency_code: "USD",
                                value: tax.toFixed(2)
                            }
                        }
                    },
                    items: paypalItems,
                    shipping: {
                        name: {
                            full_name: `${shippingDetails.firstName || ''} ${shippingDetails.lastName || ''}`.trim()
                        },
                        address: {
                            address_line_1: shippingDetails.street || "",
                            address_line_2: shippingDetails.address2 || "",
                            admin_area_2: shippingDetails.city || "",
                            admin_area_1: shippingDetails.state || "",
                            postal_code: shippingDetails.zipCode || "",
                            country_code: countryCode
                        }
                    }
                }
            ],
            application_context: {
                shipping_preference: "SET_PROVIDED_ADDRESS",
                user_action: "PAY_NOW",
                return_url: finalReturnUrl,
                cancel_url: finalCancelUrl
            }
        };
        
        request.requestBody(requestBody);
        
        // Log the request body for debugging (truncated)
        console.log('📄 PayPal request body (truncated):');
        console.log(JSON.stringify(requestBody).substring(0, 300) + '...');
        
        // Call PayPal API to create order
        console.log('📡 Sending create order request to PayPal...');
        let paypalOrder;
        try {
            paypalOrder = await paypalClient().execute(request);
            console.log(`✅ PayPal order created successfully: ${paypalOrder.result.id}`);
            console.log(`📊 Initial PayPal order status: ${paypalOrder.result.status}`);
        } catch (paypalError) {
            console.error(`❌ Error creating PayPal order:`, paypalError);
            // Mark order as failed in our database
            order.status = "cancelled";
            order.statusHistory.push({
                status: "cancelled",
                timestamp: new Date(),
                note: `PayPal order creation failed: ${paypalError.message}`
            });
            await order.save();
            console.log(`📝 Updated order status to cancelled due to PayPal error`);
            throw paypalError;
        }
        
        // Update our order with the PayPal order ID
        console.log(`📝 Updating order with PayPal details...`);
        order.paymentDetails = {
            provider: "PayPal",
            paypalOrderId: paypalOrder.result.id,
            status: paypalOrder.result.status,
            createdAt: new Date()
        };
        
        // Save again with the updated PayPal info
        console.log(`💾 Saving order with PayPal details...`);
        await order.save();
        console.log(`✅ Order updated with PayPal details (ID: ${paypalOrder.result.id})`);
        
        // Check if we need to redirect the user to approve the payment
        if (paypalOrder.result.status === 'CREATED') {
            // Find the approval URL in the links array
            const approvalLink = paypalOrder.result.links.find(link => 
                link.rel === "approve" || link.rel === "payer-action"
            );
            
            if (!approvalLink) {
                console.error(`❌ No approval link found in PayPal response!`);
                console.error(`📋 Links available:`, paypalOrder.result.links);
                
                // Mark order as problematic
                order.status = "cancelled";
                order.statusHistory.push({
                    status: "cancelled",
                    timestamp: new Date(),
                    note: "Missing PayPal approval URL"
                });
                await order.save();
                console.log(`📝 Updated order status to cancelled due to missing approval URL`);
                
                throw new Error("No approval URL returned from PayPal");
            }
            
            console.log(`👉 Approval URL returned: ${approvalLink.href}`);
            console.log(`📤 Returning redirect approval flow to client`);
            
            return res.status(200).json({
                success: true,
                flowType: "redirect",
                paypalOrderId: paypalOrder.result.id,
                approvalUrl: approvalLink.href,
                orderId: order._id.toString(),
                orderNumber: orderNumber,
                tempOrderRef,
                toast: {
                    type: 'info',
                    message: 'Redirecting to PayPal for payment approval...'
                }
            });
        }
        
        // If PayPal status is already APPROVED or COMPLETED, we can proceed to capture
        if (paypalOrder.result.status === 'APPROVED' || 
            paypalOrder.result.status === 'COMPLETED') {
            
            console.log(`✅ PayPal order already in ${paypalOrder.result.status} status, proceeding with capture...`);
            
            // Proceed with capturing the payment
            console.log(`📡 Sending capture request to PayPal API...`);
            let capture;
            try {
                const captureRequest = new checkoutNodeJssdk.orders.OrdersCaptureRequest(paypalOrder.result.id);
                captureRequest.requestBody({});
                
                capture = await paypalClient().execute(captureRequest);
                console.log(`✅ Payment captured successfully: ${capture.result.id}`);
                console.log(`📊 Capture status: ${capture.result.status}`);
                
                // Log capture details
                if (capture.result.purchase_units && 
                    capture.result.purchase_units[0].payments && 
                    capture.result.purchase_units[0].payments.captures) {
                    
                    const captures = capture.result.purchase_units[0].payments.captures;
                    console.log(`📊 Captures:`, captures.map(c => ({
                        id: c.id,
                        status: c.status,
                        amount: `${c.amount.value} ${c.amount.currency_code}`,
                        createTime: c.create_time,
                        updateTime: c.update_time
                    })));
                }
            } catch (captureError) {
                console.error(`❌ Error capturing payment:`, captureError);
                
                // Special handling for already captured payments
                if (captureError.statusCode === 422) {
                    console.log(`ℹ️ This appears to be an "already captured" error`);
                    
                    // Check if we need to update our database
                    const paypalOrderDetails = await checkOrderStatus(paypalOrder.result.id);
                    
                    if (paypalOrderDetails && paypalOrderDetails.status === 'COMPLETED') {
                        console.log(`✅ PayPal confirms order is COMPLETED, updating our database...`);
                        
                        // Update order with completed status
                        order.isPaid = true;
                        order.paidAt = new Date();
                        order.status = "processing";
                        order.paymentDetails.status = "COMPLETED";
                        order.paymentDetails.completedAt = new Date();
                        order.statusHistory.push({
                            status: "processing",
                            timestamp: new Date(),
                            note: "Payment already completed in PayPal"
                        });
                        
                        await order.save();
                        console.log(`✅ Order updated with completed payment status`);
                        
                        // Delete the cart if we have a cartId
                        if (cartId) {
                            await deleteCart(cartId, userId, order._id);
                        }
                        
                        return res.status(200).json({
                            success: true,
                            flowType: "captured",
                            paypalOrderId: paypalOrder.result.id,
                            orderId: order._id.toString(),
                            orderNumber: orderNumber,
                            status: "COMPLETED",
                            alreadyCaptured: true,
                            toast: {
                                type: 'success',
                                message: 'Payment completed successfully!'
                            }
                        });
                    }
                }
                
                // For other capture errors, return partial success
                console.log(`⚠️ Returning partial success with approval URL`);
                
                // Find the approval URL again
                const approvalLink = paypalOrder.result.links.find(link => 
                    link.rel === "approve" || link.rel === "payer-action"
                );
                
                if (approvalLink) {
                    return res.status(200).json({
                        success: true,
                        flowType: "redirect",
                        paypalOrderId: paypalOrder.result.id,
                        approvalUrl: approvalLink.href,
                        orderId: order._id.toString(),
                        orderNumber: orderNumber,
                        captureError: captureError.message,
                        toast: {
                            type: 'warning',
                            message: 'Additional approval required. Please complete payment on PayPal.'
                        }
                    });
                } else {
                    throw captureError; // Re-throw if we can't provide a fallback URL
                }
            }
            
            // Update order with capture information
            console.log(`📝 Updating order with capture information...`);
            const captureId = capture.result.purchase_units[0].payments.captures[0].id;
            const captureStatus = capture.result.status;
            
            order.paymentDetails = {
                ...order.paymentDetails,
                status: captureStatus,
                captureId: captureId,
                capturedAt: new Date(),
                paymentData: capture.result
            };
            
            // Update order status based on payment result
            if (captureStatus === "COMPLETED") {
                order.status = "processing";
                order.statusHistory.push({
                    status: "processing",
                    timestamp: new Date(),
                    note: "Payment completed via one-step checkout"
                });
                order.isPaid = true;
                order.paidAt = new Date();
                
                console.log(`💰 Payment successful for order ${order._id}`);
                
                // Delete the cart if we have a cartId
                if (cartId) {
                    console.log(`🗑️ Attempting to delete cart with ID: ${cartId}`);
                    await deleteCart(cartId, userId, order._id);
                }
            } else {
                console.log(`⚠️ Payment not completed. Status: ${captureStatus}`);
            }
            
            // Save the updated order
            console.log(`💾 Saving final order with payment details...`);
            await order.save();
            console.log(`✅ Order successfully saved with payment details`);
            
            // Return success response
            console.log(`📤 Sending successful capture response to client`);
            return res.status(200).json({
                success: true,
                flowType: "captured",
                paypalOrderId: paypalOrder.result.id,
                captureId: order.paymentDetails.captureId,
                status: order.paymentDetails.status,
                orderId: order._id.toString(),
                orderNumber: orderNumber,
                amount: order.amount,
                toast: {
                    type: 'success',
                    message: 'Payment completed successfully!'
                }
            });
        }
        
        // If we get here, it's an unexpected status
        console.log(`⚠️ PayPal returned unexpected status: ${paypalOrder.result.status}`);
        
        // Find the approval URL as a fallback
        const approvalLink = paypalOrder.result.links.find(link => 
            link.rel === "approve" || link.rel === "payer-action"
        );
        
        if (approvalLink) {
            console.log(`🔗 Returning approval URL as fallback: ${approvalLink.href}`);
            return res.status(200).json({
                success: true,
                flowType: "redirect",
                paypalOrderId: paypalOrder.result.id,
                approvalUrl: approvalLink.href,
                orderId: order._id.toString(),
                orderNumber: orderNumber,
                unexpectedStatus: paypalOrder.result.status,
                toast: {
                    type: 'warning',
                    message: 'Please complete payment on PayPal'
                }
            });
        }
        
        // If we can't even find an approval URL, something is wrong
        console.error(`❌ PayPal returned unexpected status and no approval URL`);
        throw new Error(`Unexpected PayPal order status: ${paypalOrder.result.status}`);
        
    } catch (error) {
        console.error(`❌ Error in checkout-cart:`, error);
        console.error(util.inspect(error, { depth: 3, colors: true }));
        
        // Include toast message in error response
        res.status(500).json({
            success: false,
            message: "Error processing checkout", 
            error: error.message,
            toast: {
                type: 'error',
                message: 'Checkout failed. Please try again.'
            }
        });
    }
});

/**
 * Helper function to check PayPal order status
 * @param {string} paypalOrderId - The PayPal order ID
 * @returns {Promise<Object>} The order details
 */
async function checkOrderStatus(paypalOrderId) {
    console.log(`🔍 Checking PayPal order status for: ${paypalOrderId}`);
    try {
        const getOrderRequest = new checkoutNodeJssdk.orders.OrdersGetRequest(paypalOrderId);
        const orderDetails = await paypalClient().execute(getOrderRequest);
        console.log(`✅ PayPal order status: ${orderDetails.result.status}`);
        return orderDetails.result;
    } catch (error) {
        console.error(`❌ Error checking PayPal order status:`, error);
        return null;
    }
}

/**
 * Helper function to delete cart
 * @param {string} cartId - The cart ID
 * @param {string} userId - The user ID
 * @param {string} orderId - The order ID
 */
async function deleteCart(cartId, userId, orderId) {
    console.log(`🗑️ Attempting to delete cart with ID: ${cartId}`);
    try {
        // Validate cart ID format
        if (!mongoose.Types.ObjectId.isValid(cartId)) {
            console.log(`❌ Invalid cart ID format: ${cartId}`);
            return false;
        }
        
        // Try to find the cart first
        const cartExists = await Cart.findById(cartId);
        if (!cartExists) {
            console.log(`ℹ️ Cart with ID ${cartId} not found or already deleted`);
            return true;
        }
        
        // Delete the cart
        const deleteResult = await Cart.findByIdAndDelete(cartId);
        
        if (deleteResult) {
            console.log(`✅ Successfully deleted cart: ${cartId}`);
            
            // Update the order with cart deletion info
            if (orderId) {
                console.log(`📝 Updating order ${orderId} with cart deletion reference...`);
                try {
                    const order = await Order.findById(orderId);
                    if (order) {
                        // Add note to status history
                        order.statusHistory.push({
                            status: order.status,
                            timestamp: new Date(),
                            note: `Cart ${cartId} deleted after payment`
                        });
                        
                        // Update metadata
                        if (!order.metadata) order.metadata = {};
                        order.metadata.cartDeletedAt = new Date();
                        
                        await order.save();
                        console.log(`✅ Order updated with cart deletion reference`);
                    }
                } catch (orderError) {
                    console.error(`⚠️ Error updating order with cart deletion info:`, orderError);
                    // Continue even if order update fails
                }
            }
            
            return true;
        } else {
            console.log(`⚠️ Cart deletion returned null result`);
            return false;
        }
    } catch (error) {
        console.error(`❌ Error deleting cart:`, error);
        return false;
    }
}
/**
 * Capture PayPal Order Payment
 * Enhanced with better error handling and debugging
 */
router.post('/capture-order', async (req, res) => {
    console.log('📦 API CALL: /capture-order');
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        // Validate request
        const { paypalOrderId, orderId, tempOrderRef } = req.body;
        
        if (!paypalOrderId) {
            console.log('❌ Missing PayPal order ID');
            return res.status(400).json({ 
                success: false, 
                message: "Missing PayPal order ID" 
            });
        }
        
        console.log(`🔍 Attempting to capture payment for PayPal order: ${paypalOrderId}`);
        console.log(`🔍 Associated with order ID: ${orderId || 'Not provided'}`);
        console.log(`🔍 Associated with temp ref: ${tempOrderRef || 'Not provided'}`);
        
        // 1. FIRST: Check if order has already been captured
        console.log(`🔍 Checking if payment was already captured...`);
        try {
            const existingOrder = await Order.findOne({ 
                "paymentDetails.paypalOrderId": paypalOrderId
            });
            
            if (existingOrder) {
                console.log(`✅ Found existing order: ${existingOrder._id}`);
                console.log(`📊 Status: ${existingOrder.status}, PayPal status: ${existingOrder.paymentDetails?.status || 'N/A'}, Paid: ${existingOrder.isPaid || false}`);
                
                if (existingOrder.paymentDetails?.status === "COMPLETED" && existingOrder.isPaid) {
                    console.log(`ℹ️ This order has already been captured successfully`);
                    return res.status(200).json({
                        success: true,
                        alreadyProcessed: true,
                        captureId: existingOrder.paymentDetails.captureId,
                        status: "COMPLETED",
                        orderId: existingOrder._id.toString(),
                        amount: existingOrder.amount
                    });
                } else {
                    console.log(`ℹ️ Order exists but is not yet completed - will attempt to capture`);
                }
            } else {
                console.log(`ℹ️ No existing order found for PayPal ID: ${paypalOrderId}`);
            }
        } catch (err) {
            console.error(`⚠️ Error checking for existing capture:`, err);
            // Continue with capture attempt even if this check fails
        }
        
        // 2. Get the current status from PayPal
        console.log(`🔍 Checking current PayPal order status...`);
        let orderDetails;
        try {
            const getOrder = new checkoutNodeJssdk.orders.OrdersGetRequest(paypalOrderId);
            orderDetails = await paypalClient().execute(getOrder);
            console.log(`Current PayPal order status: ${orderDetails.result.status}`);
            console.log(`PayPal order details (summary): ID=${orderDetails.result.id}, Create Time=${orderDetails.result.create_time}`);
            
            // Log more details if needed
            console.log(`PayPal order links:`, orderDetails.result.links.map(link => ({
                rel: link.rel,
                href: link.href,
                method: link.method
            })));
            
            if (orderDetails.result.purchase_units && orderDetails.result.purchase_units.length > 0) {
                const unit = orderDetails.result.purchase_units[0];
                console.log(`Reference ID: ${unit.reference_id || 'N/A'}, Custom ID: ${unit.custom_id || 'N/A'}`);
                
                // Check if this order already has captures
                if (unit.payments && unit.payments.captures && unit.payments.captures.length > 0) {
                    console.log(`⚠️ Order already has captures:`, unit.payments.captures.map(capture => ({
                        id: capture.id,
                        status: capture.status,
                        amount: capture.amount
                    })));
                }
            }
        } catch (err) {
            console.error(`❌ Error getting order details from PayPal:`, err);
            return res.status(400).json({
                success: false,
                message: "Failed to retrieve order details from PayPal",
                error: err.message
            });
        }
        
        // 3. Only proceed with capture if status is APPROVED
        if (orderDetails.result.status !== 'APPROVED') {
            console.log(`⚠️ Cannot capture payment: Order status is ${orderDetails.result.status}`);
            
            // Special handling for COMPLETED status - may just need to update our records
            if (orderDetails.result.status === 'COMPLETED') {
                console.log(`ℹ️ Order is already COMPLETED in PayPal`);
                
                // Try to update our database
                if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
                    const dbOrder = await Order.findById(orderId);
                    if (dbOrder && !dbOrder.isPaid) {
                        console.log(`📝 Updating order in database to mark as paid`);
                        dbOrder.isPaid = true;
                        dbOrder.paidAt = new Date();
                        dbOrder.status = "processing";
                        dbOrder.paymentDetails = {
                            ...dbOrder.paymentDetails,
                            status: "COMPLETED",
                            completedAt: new Date()
                        };
                        dbOrder.statusHistory.push({
                            status: "processing",
                            timestamp: new Date(),
                            note: "Payment marked as completed (already captured in PayPal)"
                        });
                        await dbOrder.save();
                        console.log(`✅ Order ${dbOrder._id} marked as paid`);
                        
                        return res.status(200).json({
                            success: true,
                            status: "COMPLETED",
                            orderId: dbOrder._id.toString(),
                            amount: dbOrder.amount,
                            message: "Order already completed in PayPal, database updated"
                        });
                    }
                }
            }
            
            return res.status(400).json({
                success: false,
                message: `Order must be approved before capturing. Current status: ${orderDetails.result.status}`,
                orderStatus: orderDetails.result.status,
                paypalOrderId: paypalOrderId
            });
        }
        
        // 4. Proceed with capture
        console.log('✅ Order is approved, proceeding with capture...');
        
        let capture;
        try {
            const request = new checkoutNodeJssdk.orders.OrdersCaptureRequest(paypalOrderId);
            request.requestBody({});
            
            console.log(`📡 Sending capture request to PayPal API...`);
            capture = await paypalClient().execute(request);
            console.log(`✅ Payment captured successfully: ${capture.result.id}`);
            console.log(`📊 Capture status: ${capture.result.status}`);
            
            // Log capture details
            if (capture.result.purchase_units && 
                capture.result.purchase_units[0].payments && 
                capture.result.purchase_units[0].payments.captures) {
                
                const captures = capture.result.purchase_units[0].payments.captures;
                console.log(`📊 Captures:`, captures.map(c => ({
                    id: c.id,
                    status: c.status,
                    amount: `${c.amount.value} ${c.amount.currency_code}`,
                    createTime: c.create_time,
                    updateTime: c.update_time
                })));
            }
        } catch (captureError) {
            console.error(`❌ Error capturing payment:`, captureError);
            console.error(`❌ Error details:`, util.inspect(captureError, { depth: 3 }));
            
            // Special handling for common PayPal errors
            if (captureError.statusCode === 422) {
                console.log(`ℹ️ This looks like an "already captured" error. Checking if our DB needs updating...`);
                
                // Try to get the order from DB and update if needed
                if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
                    try {
                        const dbOrder = await Order.findById(orderId);
                        if (dbOrder && !dbOrder.isPaid) {
                            console.log(`📝 Order exists but not marked as paid. Updating...`);
                            dbOrder.isPaid = true;
                            dbOrder.paidAt = new Date();
                            dbOrder.status = "processing";
                            dbOrder.statusHistory.push({
                                status: "processing",
                                timestamp: new Date(),
                                note: "Payment assumed completed (already captured in PayPal)"
                            });
                            await dbOrder.save();
                            
                            return res.status(200).json({
                                success: true,
                                message: "Order appears to be already captured in PayPal, database updated",
                                status: "COMPLETED",
                                orderId: dbOrder._id.toString()
                            });
                        }
                    } catch (dbError) {
                        console.error(`❌ Error updating database for already captured order:`, dbError);
                    }
                }
                
                return res.status(422).json({
                    success: false,
                    message: "Order cannot be captured at this time. It may not be approved by the payer or has already been captured.",
                    errorCode: captureError.message
                });
            }
            
            return res.status(500).json({
                success: false,
                message: "Failed to capture payment with PayPal",
                error: captureError.message
            });
        }
        
        // 5. Find or create our order
        console.log(`🔍 Looking up or creating final order record...`);
        
        // Get the orderId from different possible sources
        let dbOrderId = orderId;
        let dbOrder;
        
        // Try to find existing order first
        if (dbOrderId && mongoose.Types.ObjectId.isValid(dbOrderId)) {
            console.log(`🔍 Looking up order by ID: ${dbOrderId}`);
            dbOrder = await Order.findById(dbOrderId);
            console.log(`Order lookup result: ${dbOrder ? 'Found ✅' : 'Not found ❌'}`);
        }
        
        // If not found by direct ID, try PayPal order ID
        if (!dbOrder) {
            console.log(`🔍 Looking up order by PayPal ID: ${paypalOrderId}`);
            dbOrder = await Order.findOne({ "paymentDetails.paypalOrderId": paypalOrderId });
            console.log(`Order lookup result: ${dbOrder ? 'Found ✅' : 'Not found ❌'}`);
        }
        
        // If still not found and we have a temp reference, need to create a permanent order
        if (!dbOrder && tempOrderRef) {
            console.log(`📝 Need to create permanent order from temporary reference: ${tempOrderRef}`);
            
            // Extract information from capture result to create final order
            const purchaseUnit = capture.result.purchase_units[0];
            const shippingInfo = purchaseUnit.shipping;
            const paymentCapture = purchaseUnit.payments.captures[0];
            
            // Get userId from custom_id
            const userId = purchaseUnit.custom_id;
            console.log(`👤 User ID from PayPal response: ${userId}`);
            
            // Create a new order
            dbOrder = new Order({
                user: userId,
                orderNumber: `ORD-${Date.now().toString().substring(6)}`,
                products: [], // Will be filled from temporary data
                status: "processing",
                statusHistory: [{
                    status: "processing",
                    timestamp: new Date(),
                    note: "Order created and payment completed via PayPal"
                }],
                address: {
                    firstName: shippingInfo.name?.full_name?.split(' ')[0] || "",
                    lastName: shippingInfo.name?.full_name?.split(' ').slice(1).join(' ') || "",
                    street: shippingInfo.address?.address_line_1 || "",
                    address2: shippingInfo.address?.address_line_2 || "",
                    city: shippingInfo.address?.admin_area_2 || "",
                    state: shippingInfo.address?.admin_area_1 || "",
                    zipCode: shippingInfo.address?.postal_code || "",
                    country: shippingInfo.address?.country_code || "US"
                },
                amount: parseFloat(purchaseUnit.amount.value),
                subtotal: parseFloat(purchaseUnit.amount.breakdown.item_total.value),
                shippingCost: parseFloat(purchaseUnit.amount.breakdown.shipping.value),
                tax: parseFloat(purchaseUnit.amount.breakdown.tax_total.value),
                paymentMethod: "PayPal",
                isPaid: true,
                paidAt: new Date(),
                paymentDetails: {
                    provider: "PayPal",
                    paypalOrderId: paypalOrderId,
                    status: capture.result.status,
                    captureId: paymentCapture.id,
                    capturedAt: new Date(),
                    amount: parseFloat(paymentCapture.amount.value),
                    paymentData: capture.result
                },
                tempOrderRef: tempOrderRef
            });
            
            console.log(`📝 Created new order: ${dbOrder._id}`);
        }
        
        // If we still don't have an order, something is wrong
        if (!dbOrder) {
            console.log(`❌ Could not find or create an order for PayPal ID: ${paypalOrderId}`);
            return res.status(404).json({
                success: false,
                message: "Order not found and could not create a new one"
            });
        }
        
        // 6. Update existing order if needed
        if (dbOrder.isPaid !== true) {
            console.log(`📝 Updating order payment status...`);
            
            // Update order payment status
            const captureId = capture.result.purchase_units[0].payments.captures[0].id;
            const captureStatus = capture.result.status;
            
            dbOrder.paymentDetails = {
                ...dbOrder.paymentDetails,
                status: captureStatus,
                captureId: captureId,
                capturedAt: new Date(),
                paymentData: capture.result
            };
            
            // Update order status based on payment result
            if (captureStatus === "COMPLETED") {
                dbOrder.status = "processing";
                dbOrder.statusHistory.push({
                    status: "processing",
                    timestamp: new Date(),
                    note: "Payment completed via PayPal"
                });
                dbOrder.isPaid = true;
                dbOrder.paidAt = new Date();
                
                console.log(`💰 Payment successful for order ${dbOrder._id}`);
            } else {
                console.log(`⚠️ Payment not completed. Status: ${captureStatus}`);
            }
        } else {
            console.log(`ℹ️ Order already marked as paid, no update needed`);
        }
        
        // 7. Save the order
        console.log(`💾 Saving order to database...`);
        await dbOrder.save();
        
        // 8. Return success response
        console.log(`📤 Sending successful response to client`);
        res.status(200).json({
            success: true, 
            captureId: dbOrder.paymentDetails.captureId,
            status: dbOrder.paymentDetails.status,
            orderId: dbOrder._id.toString(),
            amount: dbOrder.amount
        });
    } catch (error) {
        console.error(`❌ Error in capture-order endpoint:`, error);
        console.error(util.inspect(error, { depth: 3, colors: true }));
        
        res.status(500).json({
            success: false,
            message: "Error capturing payment", 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * Create order directly from cart items
 * Bypasses the need to first create an order and then create PayPal order
 */
router.post('/create-from-cart', async (req, res) => {
    console.log('📦 API CALL: /create-from-cart');
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        console.log('🔍 Starting order creation process...');
        // Validate request
        const { userId, cartItems, shippingDetails, returnUrl, cancelUrl, orderId, total } = req.body;
        
        console.log(`🔍 Validating request data...`);
        
        if (!userId) {
            console.log('❌ Missing user ID');
            return res.status(400).json({ 
                success: false, 
                message: "Missing user ID" 
            });
        }
        
        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            console.log('❌ Missing or invalid cart items');
            return res.status(400).json({ 
                success: false, 
                message: "Cart items are required" 
            });
        }
        
        if (!shippingDetails) {
            console.log('❌ Missing shipping details');
            return res.status(400).json({ 
                success: false, 
                message: "Shipping details are required" 
            });
        }
        
        // Validate orderId parameter (new requirement)
        if (!orderId) {
            console.log('❌ Missing order ID');
            return res.status(400).json({ 
                success: false, 
                message: "Order ID is required" 
            });
        }
        
        // Validate total parameter (new requirement)
        if (total === undefined || total === null || isNaN(parseFloat(total))) {
            console.log('❌ Missing or invalid total amount');
            return res.status(400).json({ 
                success: false, 
                message: "Total amount is required and must be a number" 
            });
        }
        
        // Convert total to a number if it's a string
        const totalAmount = parseFloat(total);
        
        console.log(`✅ Request validation passed`);
        console.log(`🔍 Processing cart-to-order for user: ${userId}`);
        console.log(`📦 Cart contains ${cartItems.length} items`);
        console.log(`💰 Provided total amount: $${totalAmount.toFixed(2)}`);
        console.log(`🔑 Processing with order ID: ${orderId}`);
        
        // Calculate order totals
        console.log(`💰 Calculating order totals...`);
        
        const subtotal = cartItems.reduce((sum, item) => {
            const price = parseFloat(item.price) || 0;
            const quantity = parseInt(item.quantity) || 1;
            return sum + (price * quantity);
        }, 0);
        
        // Apply shipping cost (free for orders over $100)
        const shippingCost = subtotal > 100 ? 0 : 9.99;
        
        // Apply tax (7%)
        const tax = subtotal * 0.07;
        
        // Calculate final total - compare with provided total for validation
        const calculatedTotal = subtotal + shippingCost + tax;
        
        console.log(`💰 Order totals: Subtotal: $${subtotal.toFixed(2)}, Shipping: $${shippingCost.toFixed(2)}, Tax: $${tax.toFixed(2)}, Calculated Total: $${calculatedTotal.toFixed(2)}`);
        
        // Validate that the provided total matches the calculated total (with small tolerance for rounding)
        if (Math.abs(calculatedTotal - totalAmount) > 0.01) {
            console.log(`⚠️ Provided total ($${totalAmount.toFixed(2)}) does not match calculated total ($${calculatedTotal.toFixed(2)})`);
            // Depending on your business requirements, you might want to:
            // 1. Reject the request (uncomment below)
            /*
            return res.status(400).json({ 
                success: false, 
                message: "Total amount mismatch. Please recalculate your order total." 
            });
            */
            // 2. OR log the warning but proceed using the calculated total (current behavior)
            console.log(`⚠️ Proceeding with calculated total: $${calculatedTotal.toFixed(2)}`);
        }

        // Create a temporary order reference to track this transaction
        const timestamp = Date.now();
        const tempOrderRef = `TEMP-${timestamp}-${userId.substring(0, 8)}`;
        console.log(`📝 Created temporary order reference: ${tempOrderRef}`);


        // IMPORTANT: Create an actual order in MongoDB before PayPal interaction
        console.log(`💾 Creating permanent order record in MongoDB database...`);
        
        // Format products for order schema
        console.log(`🔄 Formatting product data for Order schema...`);
        const formattedProducts = cartItems.map(item => {
            console.log(`📦 Processing item: ${item.title || item.name}, price: ${item.price}`);
            return {
                productId: item.productId || item._id || new mongoose.Types.ObjectId(),
                title: item.title || item.name || "Product",
                price: parseFloat(item.price) || 0,
                quantity: parseInt(item.quantity) || 1,
                img: item.img || item.image,
                color: item.color,
                size: item.size
            };
        });
        console.log(`✅ Formatted ${formattedProducts.length} products for order`);

        // Generate order number
        const orderNumber = `ORD-${timestamp.toString().substring(6)}`;
        console.log(`📄 Generated order number: ${orderNumber}`);

        // Create a new Order document
        console.log(`🏗️ Creating new Order document...`);
        const order = new Order({
            userId: userId,
            orderNumber: orderNumber,
            products: formattedProducts,
            subtotal: subtotal,
            tax: tax,
            shippingCost: shippingCost,
            amount: total,
            status: "pending",
            statusHistory: [{
                status: "pending",
                timestamp: new Date(),
                note: "Order created, awaiting payment"
            }],
            address: {
                street: shippingDetails.street,
                city: shippingDetails.city,
                country: shippingDetails.country,
                zipCode: shippingDetails.zipCode,
                phone: shippingDetails.phone
            },
            metadata: {
                tempOrderRef: tempOrderRef
            }
        });
        
        console.log(`💾 About to save order document to database...`);
        // Save the order to get an _id
        try {
            await order.save();
            console.log(`✅ Order successfully created with ID: ${order._id}`);
        } catch (saveError) {
            console.error(`❌ Failed to save order to database:`, saveError);
            throw new Error(`Failed to create order in database: ${saveError.message}`);
        }
        
        // Set up PayPal order with reference to our database order
        console.log(`📡 Creating PayPal order request...`);
        const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
        request.prefer("return=representation");
        
        // Format cart items for PayPal
        console.log(`🧾 Formatting cart items for PayPal...`);
        const paypalItems = cartItems.map(item => {
            return {
                name: item.title || item.name || "Product",
                unit_amount: {
                    currency_code: "USD",
                    value: parseFloat(item.price).toFixed(2)
                },
                quantity: parseInt(item.quantity) || 1,
                description: `${item.color || ''} ${item.size || ''}`.trim() || undefined,
                sku: item.productId || item._id || undefined,
                category: "PHYSICAL_GOODS"
            };
        });
        
        // Get country code in proper ISO 3166-1 alpha-2 format
        const countryCode = getCountryCode(shippingDetails.country);
        console.log(`🌎 Using country code: ${countryCode} (converted from "${shippingDetails.country}")`);
        
        // Set up return and cancel URLs with query parameters for toast notifications
        console.log(`🔗 Setting up return/cancel URLs with toast support...`);
        
        // Use the provided returnUrl/cancelUrl or defaults
        let finalReturnUrl = returnUrl || 'http://localhost:3000/checkout/confirmation';
        let finalCancelUrl = cancelUrl || 'http://localhost:3000/checkout/success';
        
        // Add toast parameters and order information to the URLs
        try {
            // For return URL (success), add success=true, message and orderId
            const returnUrlObj = new URL(finalReturnUrl);
            returnUrlObj.searchParams.set('success', 'true');
            returnUrlObj.searchParams.set('message', 'Payment successful!');
            returnUrlObj.searchParams.set('toastType', 'success');
            returnUrlObj.searchParams.set('orderId', order._id.toString());
            returnUrlObj.searchParams.set('orderNumber', orderNumber);
            finalReturnUrl = returnUrlObj.toString();
            
            // For cancel URL, add canceled=true, message and orderId
            const cancelUrlObj = new URL(finalCancelUrl);
            cancelUrlObj.searchParams.set('canceled', 'true');
            cancelUrlObj.searchParams.set('message', 'Payment was canceled');
            cancelUrlObj.searchParams.set('toastType', 'error');
            cancelUrlObj.searchParams.set('orderId', order._id.toString());
            finalCancelUrl = cancelUrlObj.toString();
        } catch (urlError) {
            console.error(`❌ Error formatting URLs:`, urlError);
            // If URL parsing fails, append parameters manually
            finalReturnUrl += finalReturnUrl.includes('?') 
                ? `&success=true&message=Payment%20successful!&toastType=success&orderId=${order._id.toString()}&orderNumber=${orderNumber}` 
                : `?success=true&message=Payment%20successful!&toastType=success&orderId=${order._id.toString()}&orderNumber=${orderNumber}`;
                
            finalCancelUrl += finalCancelUrl.includes('?') 
                ? `&canceled=true&message=Payment%20was%20canceled&toastType=error&orderId=${order._id.toString()}` 
                : `?canceled=true&message=Payment%20was%20canceled&toastType=error&orderId=${order._id.toString()}`;
        }
        
        console.log(`🔗 Return URL: ${finalReturnUrl}`);
        console.log(`🔗 Cancel URL: ${finalCancelUrl}`);
        
        // Update the requestBody to include our database orderId
        console.log(`📝 Building PayPal order request body...`);
        const requestBody = {
            intent: "CAPTURE",
            purchase_units: [
                {
                    reference_id: order._id.toString(), // Use our actual order ID
                    description: `Order #${orderNumber}`,
                    custom_id: userId, // Include user ID for reference
                    amount: {
                        currency_code: "USD",
                        value: total.toFixed(2),
                        breakdown: {
                            item_total: {
                                currency_code: "USD",
                                value: subtotal.toFixed(2)
                            },
                            shipping: {
                                currency_code: "USD",
                                value: shippingCost.toFixed(2)
                            },
                            tax_total: {
                                currency_code: "USD",
                                value: tax.toFixed(2)
                            }
                        }
                    },
                    items: paypalItems,
                    shipping: {
                        name: {
                            full_name: `${shippingDetails.firstName || ''} ${shippingDetails.lastName || ''}`.trim()
                        },
                        address: {
                            address_line_1: shippingDetails.street || "",
                            address_line_2: shippingDetails.address2 || "",
                            admin_area_2: shippingDetails.city || "",
                            admin_area_1: shippingDetails.state || "",
                            postal_code: shippingDetails.zipCode || "",
                            country_code: countryCode
                        }
                    }
                }
            ],
            application_context: {
                shipping_preference: "SET_PROVIDED_ADDRESS",
                user_action: "PAY_NOW",
                return_url: finalReturnUrl,
                cancel_url: finalCancelUrl
            }
        };
        
        request.requestBody(requestBody);
        
        // Log the request body for debugging
        console.log('📄 PayPal request body (truncated):');
        console.log(JSON.stringify(requestBody).substring(0, 500) + '...');
        
        // Call PayPal API to create order
        console.log('📡 Sending request to PayPal...');
        let paypalOrder;
        try {
            paypalOrder = await paypalClient().execute(request);
            console.log(`✅ PayPal order created successfully: ${paypalOrder.result.id}`);
            console.log(`📊 PayPal order status: ${paypalOrder.result.status}`);
        } catch (paypalError) {
            console.error(`❌ Error creating PayPal order:`, paypalError);
            // Mark order as failed in our database
            order.status = "cancelled";
            order.statusHistory.push({
                status: "cancelled",
                timestamp: new Date(),
                note: `PayPal order creation failed: ${paypalError.message}`
            });
            await order.save();
            throw paypalError;
        }
        
        // Find the approval URL in the links array
        const approvalLink = paypalOrder.result.links.find(link => 
            link.rel === "approve" || link.rel === "payer-action"
        );
        
        if (!approvalLink) {
            console.error(`❌ No approval link found in PayPal response!`);
            console.error(`📋 Links available:`, paypalOrder.result.links);
            
            // Mark order as problematic
            order.status = "cancelled";
            order.statusHistory.push({
                status: "cancelled",
                timestamp: new Date(),
                note: "Missing PayPal approval URL"
            });
            await order.save();
            
            throw new Error("No approval URL returned from PayPal");
        }
        
        console.log(`👉 Approval URL: ${approvalLink.href}`);
        
        // Update our order with the PayPal order ID
        console.log(`📝 Updating order with PayPal details...`);
        order.paymentDetails = {
            provider: "PayPal",
            paypalOrderId: paypalOrder.result.id,
            status: "CREATED",
            approvalUrl: approvalLink.href
        };
        
        // Save again with the updated PayPal info
        console.log(`💾 Saving order with PayPal details...`);
        await order.save();
        console.log(`✅ Order updated with PayPal details`);
        
        // Return success response with order ID included
        console.log(`📤 Sending successful response to client with orderId: ${order._id.toString()}`);
        return res.status(200).json({
            success: true,
            paypalOrderId: paypalOrder.result.id,
            approvalUrl: approvalLink.href,
            orderId: order._id.toString(), // Include our database order ID
            orderNumber: orderNumber,
            tempOrderRef,
            toast: {
                type: 'info',
                message: 'Redirecting to PayPal for payment...'
            }
        });
    } catch (error) {
        console.error(`❌ Error creating order from cart:`, error);
        console.error(util.inspect(error, { depth: 3, colors: true }));
        
        // Include toast message in error response
        res.status(500).json({
            success: false,
            message: "Error creating order from cart", 
            error: error.message,
            toast: {
                type: 'error',
                message: 'Failed to create order. Please try again.'
            }
        });
    }
});

/**
 * Get Payment Status
 * Check the status of a payment
 */
router.get('/payment-status/:orderId', async (req, res) => {
    try {
        const orderId = req.params.orderId;
        
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid order ID format" 
            });
        }
        
        const order = await Order.findById(orderId);
        
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: "Order not found" 
            });
        }
        
        return res.status(200).json({
            success: true,
            isPaid: !!order.isPaid,
            paymentStatus: order.paymentDetails?.status || "NOT_STARTED",
            paymentProvider: order.paymentDetails?.provider || null,
            amount: order.amount, // Include the order amount in the response
            orderNumber: order.orderNumber
        });
    } catch (error) {
        console.error(`❌ Error checking payment status: ${error.message}`);
        res.status(500).json({
            success: false, 
            message: "Error checking payment status", 
            error: error.message
        });
    }
});

/**
 * Get PayPal order status directly
 * For debugging issues with the PayPal order status
 */
router.get('/paypal-status/:paypalOrderId', async (req, res) => {
    console.log('📦 API CALL: /paypal-status/:paypalOrderId');
    
    try {
        const paypalOrderId = req.params.paypalOrderId;
        console.log(`🔍 Checking PayPal status for order: ${paypalOrderId}`);
        
        if (!paypalOrderId) {
            console.log('❌ Missing PayPal order ID');
            return res.status(400).json({ 
                success: false, 
                message: "Missing PayPal order ID" 
            });
        }
        
        // Get order details from PayPal
        console.log(`📡 Fetching order details from PayPal API...`);
        const getOrderRequest = new checkoutNodeJssdk.orders.OrdersGetRequest(paypalOrderId);
        const orderDetails = await paypalClient().execute(getOrderRequest);
        
        console.log(`✅ PayPal order status: ${orderDetails.result.status}`);
        
        // Return the detailed PayPal order info
        return res.status(200).json({
            success: true,
            paypalStatus: orderDetails.result.status,
            paypalDetails: {
                id: orderDetails.result.id,
                intent: orderDetails.result.intent,
                status: orderDetails.result.status,
                createTime: orderDetails.result.create_time,
                updateTime: orderDetails.result.update_time,
                links: orderDetails.result.links.map(link => ({
                    rel: link.rel,
                    href: link.href,
                    method: link.method
                }))
            }
        });
    } catch (error) {
        console.error(`❌ Error checking PayPal status:`, error);
        console.error(util.inspect(error, { depth: 3, colors: true }));
        
        res.status(500).json({
            success: false, 
            message: "Error checking PayPal status", 
            error: error.message
        });
    }
});

/**
 * Debug endpoint
 */
router.get('/debug', async (req, res) => {
    console.log('📦 API CALL: /debug');
    
    try {
        console.log('🔍 Debugging PayPal configuration...');
        console.log('Environment variables:');
        console.log(`- NODE_ENV: ${process.env.NODE_ENV || 'Not set'}`);
        console.log(`- PAYPAL_CLIENT_ID exists: ${!!process.env.PAYPAL_CLIENT_ID}`);
        console.log(`- PAYPAL_CLIENT_SECRET exists: ${!!process.env.PAYPAL_CLIENT_SECRET}`);
        console.log(`- FRONTEND_URL: ${process.env.FRONTEND_URL || 'Not set'}`);
        
        // Try a simple PayPal operation (get access token)
        // This will validate credentials directly
        try {
            console.log('📡 Testing PayPal credentials...');
            const base64Auth = Buffer.from(
                `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
            ).toString('base64');
            
            console.log('📡 Making token request to PayPal...');
            const response = await fetch('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${base64Auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: 'grant_type=client_credentials'
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ PayPal credentials are valid!');
                console.log(`✅ Got access token, expires in ${data.expires_in} seconds`);
                
                res.status(200).json({
                    success: true,
                    message: 'PayPal credentials are valid',
                    tokenExists: !!data.access_token,
                    expiresIn: data.expires_in
                });
            } else {
                const error = await response.json();
                console.error('❌ PayPal credentials test failed:', error);
                
                res.status(401).json({
                    success: false,
                    message: 'PayPal credentials are invalid',
                    error: error
                });
            }
        } catch (error) {
            console.error('❌ Error testing PayPal credentials:', error);
            console.error(util.inspect(error, { depth: 3, colors: true }));
            
            res.status(500).json({
                success: false,
                message: 'Error testing PayPal credentials',
                error: error.message
            });
        }
    } catch (error) {
        console.error('❌ Debug route error:', error);
        console.error(util.inspect(error, { depth: 3, colors: true }));
        
        res.status(500).json({
            success: false,
            message: 'Debug route error',
            error: error.message
        });
    }
});

/**
 * Capture PayPal Order Payment
 * Enhanced with better error handling and cart deletion
 */
router.post('/capture-order', async (req, res) => {
    console.log('📦 API CALL: /capture-order');
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        // Validate request
        const { paypalOrderId, orderId, tempOrderRef } = req.body;
        
        if (!paypalOrderId) {
            console.log('❌ Missing PayPal order ID');
            return res.status(400).json({ 
                success: false, 
                message: "Missing PayPal order ID" 
            });
        }
        
        console.log(`🔍 Attempting to capture payment for PayPal order: ${paypalOrderId}`);
        console.log(`🔍 Associated with order ID: ${orderId || 'Not provided'}`);
        console.log(`🔍 Associated with temp ref: ${tempOrderRef || 'Not provided'}`);
        
        // Existing code...
        
        // 5. Find or create our order
        console.log(`🔍 Looking up or creating final order record...`);
        
        // Get the orderId from different possible sources
        let dbOrderId = orderId;
        let dbOrder;
        
        // Try to find existing order first
        if (dbOrderId && mongoose.Types.ObjectId.isValid(dbOrderId)) {
            console.log(`🔍 Looking up order by ID: ${dbOrderId}`);
            dbOrder = await Order.findById(dbOrderId);
            console.log(`Order lookup result: ${dbOrder ? 'Found ✅' : 'Not found ❌'}`);
        }
        
        // If not found by direct ID, try PayPal order ID
        if (!dbOrder) {
            console.log(`🔍 Looking up order by PayPal ID: ${paypalOrderId}`);
            dbOrder = await Order.findOne({ "paymentDetails.paypalOrderId": paypalOrderId });
            console.log(`Order lookup result: ${dbOrder ? 'Found ✅' : 'Not found ❌'}`);
        }
        
        // Rest of existing code...
        
        // 6. Update existing order if needed
        if (dbOrder.isPaid !== true) {
            console.log(`📝 Updating order payment status...`);
            
            // Update order payment status
            const captureId = capture.result.purchase_units[0].payments.captures[0].id;
            const captureStatus = capture.result.status;
            
            dbOrder.paymentDetails = {
                ...dbOrder.paymentDetails,
                status: captureStatus,
                captureId: captureId,
                capturedAt: new Date(),
                paymentData: capture.result
            };
            
            // Update order status based on payment result
            if (captureStatus === "COMPLETED") {
                dbOrder.status = "processing";
                dbOrder.statusHistory.push({
                    status: "processing",
                    timestamp: new Date(),
                    note: "Payment completed via PayPal"
                });
                dbOrder.isPaid = true;
                dbOrder.paidAt = new Date();
                
                console.log(`💰 Payment successful for order ${dbOrder._id}`);
                
                // NEW: Delete the cart after successful payment
                if (dbOrder.metadata && dbOrder.metadata.cartId) {
                    const cartId = dbOrder.metadata.cartId;
                    console.log(`🗑️ Attempting to delete cart with ID: ${cartId}`);
                    
                    try {
                        // Import Cart model at the top of your file if not already
                        const Cart = require('../models/cart');
                        
                        const deleteResult = await Cart.findByIdAndDelete(cartId);
                        if (deleteResult) {
                            console.log(`✅ Successfully deleted cart: ${cartId}`);
                            
                            // Add note to order
                            dbOrder.statusHistory.push({
                                status: "processing",
                                timestamp: new Date(),
                                note: `Cart ${cartId} deleted after successful payment`
                            });
                        } else {
                            console.log(`⚠️ Cart with ID ${cartId} not found or already deleted`);
                        }
                    } catch (cartDeleteError) {
                        console.error(`❌ Error deleting cart:`, cartDeleteError);
                        // Don't fail the order just because cart deletion failed
                    }
                } else {
                    console.log(`⚠️ No cart ID found in order metadata for deletion`);
                }
            } else {
                console.log(`⚠️ Payment not completed. Status: ${captureStatus}`);
            }
        } else {
            console.log(`ℹ️ Order already marked as paid, no update needed`);
            
            // NEW: Check if we need to delete the cart for already paid orders
            if (dbOrder.metadata && dbOrder.metadata.cartId && dbOrder.isPaid) {
                const cartId = dbOrder.metadata.cartId;
                console.log(`🗑️ Checking if cart ${cartId} needs to be deleted for already paid order`);
                
                try {
                    const Cart = require('../models/cart');
                    const cartExists = await Cart.findById(cartId);
                    
                    if (cartExists) {
                        console.log(`🗑️ Cart still exists for paid order, deleting now: ${cartId}`);
                        await Cart.findByIdAndDelete(cartId);
                        console.log(`✅ Successfully deleted cart for already paid order: ${cartId}`);
                    } else {
                        console.log(`ℹ️ Cart already deleted for this order`);
                    }
                } catch (cartCheckError) {
                    console.error(`❌ Error checking/deleting cart for paid order:`, cartCheckError);
                }
            }
        }
        
        // 7. Save the order
        console.log(`💾 Saving order to database...`);
        await dbOrder.save();
        
        // 8. Return success response
        console.log(`📤 Sending successful response to client`);
        res.status(200).json({
            success: true, 
            captureId: dbOrder.paymentDetails.captureId,
            status: dbOrder.paymentDetails.status,
            orderId: dbOrder._id.toString(),
            amount: dbOrder.amount
        });
    } catch (error) {
        console.error(`❌ Error in capture-order endpoint:`, error);
        console.error(util.inspect(error, { depth: 3, colors: true }));
        
        res.status(500).json({
            success: false,
            message: "Error capturing payment", 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * Delete cart after successful order
 * This endpoint ensures the cart is deleted after payment is complete
 */
router.post('/delete-cart', async (req, res) => {
    console.log('📦 API CALL: /delete-cart');
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        const { userId, cartId, orderId } = req.body;
        
        if (!cartId) {
            console.log('❌ Missing cart ID');
            return res.status(400).json({ 
                success: false, 
                message: "Missing cart ID" 
            });
        }
        
        console.log(`🗑️ Attempting to delete cart with ID: ${cartId}`);
        console.log(`👤 User ID: ${userId || 'Not provided'}`);
        console.log(`🔍 Order ID: ${orderId || 'Not provided'}`);
        
        // Validate cart ID format
        if (!mongoose.Types.ObjectId.isValid(cartId)) {
            console.log(`❌ Invalid cart ID format: ${cartId}`);
            return res.status(400).json({
                success: false,
                message: "Invalid cart ID format"
            });
        }
        
        // Check if cart exists first
        const cartExists = await Cart.findById(cartId);
        if (!cartExists) {
            console.log(`ℹ️ Cart with ID ${cartId} not found or already deleted`);
            return res.status(200).json({
                success: true,
                alreadyDeleted: true,
                message: "Cart already deleted or not found"
            });
        }
        
        // If order ID is provided, update the order to include cart ID in metadata
        if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
            console.log(`📝 Updating order ${orderId} with cart deletion reference...`);
            try {
                const order = await Order.findById(orderId);
                if (order) {
                    // Add or update metadata
                    order.metadata = {
                        ...order.metadata,
                        cartId: cartId,
                        cartDeletedAt: new Date()
                    };
                    
                    // Add note to status history
                    order.statusHistory.push({
                        status: order.status,
                        timestamp: new Date(),
                        note: `Cart ${cartId} marked for deletion`
                    });
                    
                    await order.save();
                    console.log(`✅ Order ${orderId} updated with cart deletion reference`);
                } else {
                    console.log(`⚠️ Order ${orderId} not found, proceeding with cart deletion anyway`);
                }
            } catch (orderError) {
                console.error(`❌ Error updating order with cart deletion reference:`, orderError);
                // Continue with cart deletion even if order update fails
            }
        }
        
        // Delete the cart
        const deleteResult = await Cart.findByIdAndDelete(cartId);
        
        if (deleteResult) {
            console.log(`✅ Successfully deleted cart: ${cartId}`);
            res.status(200).json({
                success: true,
                message: "Cart deleted successfully",
                cartId: cartId
            });
        } else {
            console.log(`⚠️ Cart not found or already deleted: ${cartId}`);
            res.status(200).json({
                success: true,
                alreadyDeleted: true,
                message: "Cart may have been deleted already"
            });
        }
    } catch (error) {
        console.error(`❌ Error deleting cart:`, error);
        console.error(util.inspect(error, { depth: 3, colors: true }));
        
        res.status(500).json({
            success: false,
            message: "Error deleting cart",
            error: error.message
        });
    }
});
/**
 * Update order details
 * This endpoint allows updating order information such as status
 */
router.put('/:id', async (req, res) => {
    console.log(`📦 API CALL: PUT /orders/${req.params.id}`);
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        const orderId = req.params.id;
        
        // Validate ID format
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID format"
            });
        }
        
        // Find the order to update
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }
        
        console.log(`🔍 Found order: ${order._id}, current status: ${order.status}`);
        
        // Extract fields to update
        const {
            status,
            trackingNumber,
            shippingCarrier,
            notes,
            address
        } = req.body;
        
        // Create change log for tracking modifications
        const changes = [];
        
        // Update status if provided and different
        if (status && status !== order.status) {
            console.log(`📝 Updating order status from ${order.status} to ${status}`);
            
            // Validate status value
            const validStatuses = ["pending", "processing", "shipped", "delivered", "cancelled", "refunded"];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid status value. Must be one of: ${validStatuses.join(', ')}`
                });
            }
            
            // Add to order status history
            order.statusHistory.push({
                status: status,
                timestamp: new Date(),
                note: req.body.statusNote || `Status changed from ${order.status} to ${status}`
            });
            
            order.status = status;
            changes.push(`Status changed to "${status}"`);
        }
        
        // Update tracking information if provided
        if (trackingNumber && trackingNumber !== order.trackingNumber) {
            order.trackingNumber = trackingNumber;
            changes.push(`Tracking number updated to "${trackingNumber}"`);
        }
        
        if (shippingCarrier && shippingCarrier !== order.shippingCarrier) {
            order.shippingCarrier = shippingCarrier;
            changes.push(`Shipping carrier updated to "${shippingCarrier}"`);
        }
        
        // Update notes if provided
        if (notes && notes !== order.notes) {
            order.notes = notes;
            changes.push("Order notes updated");
        }
        
        // Update address if provided (partial update supported)
        if (address && typeof address === 'object') {
            // Only update provided address fields
            Object.keys(address).forEach(field => {
                if (address[field] && order.address[field] !== address[field]) {
                    order.address[field] = address[field];
                    changes.push(`Address ${field} updated`);
                }
            });
        }
        
        // Only save if there were changes
        if (changes.length > 0) {
            console.log(`💾 Saving order with changes: ${changes.join(', ')}`);
            await order.save();
            
            return res.status(200).json({
                success: true,
                message: "Order updated successfully",
                changes: changes,
                data: order
            });
        } else {
            console.log(`ℹ️ No changes to save`);
            return res.status(200).json({
                success: true,
                message: "No changes detected",
                data: order
            });
        }
    } catch (error) {
        console.error(`❌ Error updating order:`, error);
        return res.status(500).json({
            success: false,
            message: "Error updating order",
            error: error.message
        });
    }
});

/**
 * Helper function to send cancellation email
 * @param {Object} order - The cancelled order
 * @param {String} reason - Cancellation reason
 * @param {Object} refundDetails - Refund information (null if no refund)
 * @param {String} overrideEmail - Optional email to use instead of order.userId.email
 */
async function sendCancellationEmail(order, reason, refundDetails, overrideEmail = null) {
    try {
        console.log('🔄 Starting email cancellation process...');
        
        // Import email sender
        const emailSender = require('../helpers/email_sender');
        
        // Determine email address with detailed logging
        let userEmail = null;
        
        // Check override email first
        if (overrideEmail) {
            console.log(`📧 Using override email: ${overrideEmail}`);
            userEmail = overrideEmail;
        } 
        // Then check userId object
        else if (order.userId && order.userId.email) {
            console.log(`📧 Using email from populated userId: ${order.userId.email}`);
            userEmail = order.userId.email;
        }
        // Then check direct email property
        else if (order.email) {
            console.log(`📧 Using email from order.email: ${order.email}`);
            userEmail = order.email;
        }
        
        // Final check if we have an email
        if (!userEmail) {
            console.log('❌ Cannot send cancellation email: No email address available');
            console.log('Order userId:', order.userId);
            console.log('Order email property:', order.email);
            console.log('Override email:', overrideEmail);
            return false;
        }
        
        console.log(`📧 Will send email to: ${userEmail}`);
        
        // Format order date
        const orderDate = new Date(order.createdAt).toLocaleDateString();
        
        // Format currency
        const formatCurrency = (amount) => {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
            }).format(amount);
        };
        
        // Create appropriate content based on refund status
        let refundContent = '';
        if (refundDetails) {
            refundContent = `
                <div style="margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #28a745; border-radius: 4px;">
                    <h3 style="margin-top: 0; color: #28a745;">Refund Information</h3>
                    <p>A refund for ${formatCurrency(refundDetails.amount)} will be processed to your original payment method.</p>
                    <p>Please allow <strong>${refundDetails.estimatedDays}</strong> for the refund to appear in your account.</p>
                    <p>Payment method: ${refundDetails.method}</p>
                </div>
            `;
        } else {
            // No refund needed or applicable
            refundContent = `
                <p>No payment was processed for this order, so no refund is necessary.</p>
            `;
        }
        
        // Build the email content
        const content = `
            <p>Hello ${order.userId?.firstName || 'there'},</p>
            
            <p>Your order #${order.orderNumber} from ${orderDate} has been cancelled.</p>
            
            <div style="margin: 20px 0; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #dc3545; border-radius: 4px;">
                <h3 style="margin-top: 0; color: #dc3545;">Cancellation Details</h3>
                <p><strong>Reason:</strong> ${reason || 'No reason provided'}</p>
                <p><strong>Cancelled on:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
            
            <h3>Order Summary</h3>
            <p>Order #: <strong>${order.orderNumber}</strong></p>
            <p>Order Date: ${orderDate}</p>
            <p>Order Total: ${formatCurrency(order.amount)}</p>
            <p>Items: ${order.products?.length || 0}</p>
            
            ${refundContent}
            
            <p style="margin-top: 20px;">If you have any questions regarding this cancellation or your refund, please contact our customer support team.</p>
            
            <div style="margin-top: 30px; text-align: center;">
                <a href="https://yourdomain.com/contact" 
                   style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-weight: 500;">
                    Contact Support
                </a>
            </div>
        `;
        
        console.log('📧 Email content prepared, sending email...');
        
        // Send the email with try-catch for detailed error logging
        try {
            const result = await emailSender.sendTemplatedEmail(
                userEmail,
                `Order #${order.orderNumber} Cancellation`,
                'Order Cancellation Confirmation',
                content,
                {
                    headerBgColor: '#dc3545',
                    headerTextColor: '#ffffff'
                }
            );
            console.log('📧 Email sent successfully! Result:', result);
            return true;
        } catch (emailError) {
            console.error('❌ Error from email service:', emailError);
            if (emailError.response) {
                console.error('❌ Email service response:', emailError.response.body);
            }
            throw emailError; // Re-throw for outer catch
        }
    } catch (error) {
        console.error('❌ Error in sendCancellationEmail:', error);
        return false;
    }
}
// ...existing code...

router.post('/:id/cancel', async (req, res) => {
    console.log(`📦 API CALL: POST /orders/${req.params.id}/cancel`);
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        const orderId = req.params.id;
        const { reason, adminNote, refundEstimate } = req.body;
        
        // Validate ID format
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID format"
            });
        }
        
        // Find the order
        console.log(`🔍 Finding order ${orderId}...`);
        const order = await Order.findById(orderId);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }
        
        console.log(`✅ Found order: ${order._id}, status: ${order.status}`);
        console.log(`👤 Order userId: ${order.userId}`);
        
        // Check if order can be cancelled
        const nonCancellableStatuses = ["shipped", "delivered", "cancelled", "refunded"];
        if (nonCancellableStatuses.includes(order.status)) {
            return res.status(400).json({
                success: false,
                message: `Order cannot be cancelled because it is already ${order.status}`
            });
        }
        
        // USER EMAIL DISCOVERY - ONLY FROM USER MODEL USING ORDER.USERID
        console.log(`🔎 Starting user email discovery process...`);
        
        let userEmail = null;
        let emailSent = false;
        
        // Extract userId from the order document
        if (order.userId) {
            console.log(`📧 Looking up email using userId: ${order.userId}`);
            
            try {
                // Using mongoose directly to find user by ID
                const userDoc = await mongoose.model('User').findById(order.userId);
                
                if (userDoc && userDoc.email) {
                    userEmail = userDoc.email;
                    console.log(`✅ Retrieved email using userId: ${userEmail}`);
                } else {
                    console.log(`❌ No user found with ID: ${order.userId}`);
                }
            } catch (emailError) {
                console.error(`❌ Error looking up user:`, emailError.message);
                console.error(emailError);
            }
        } else {
            console.log(`❌ Order does not have a userId`);
        }
        
        // Determine if refund is needed
        let refundDetails = null;
        if (order.isPaid) {
            refundDetails = {
                amount: order.amount,
                currency: order.currency || 'USD',
                method: order.paymentMethod || 'PayPal',
                estimatedDays: refundEstimate || '5-10 business days'
            };
            console.log(`💰 Refund needed for paid order: ${JSON.stringify(refundDetails)}`);
        }
        
        // Update order status and add status history entry
        order.status = "cancelled";
        order.statusHistory.push({
            status: "cancelled",
            timestamp: new Date(),
            note: reason || "Order cancelled by system"
        });
        
        // Add admin note if provided
        if (adminNote) {
            if (!order.notes) order.notes = '';
            order.notes += `\n[ADMIN ${new Date().toISOString()}] ${adminNote}`;
        }
        
        console.log(`💾 Saving cancelled order`);
        await order.save();
        
        // Try to send notification email
        console.log(`📧 Attempting to send cancellation email...`);
        
        if (userEmail) {
            try {
                // Log all the parameters going into email function for debugging
                console.log(`📧 Email parameters:`, {
                    recipientEmail: userEmail,
                    orderNumber: order.orderNumber || order._id.toString(),
                    orderDate: order.createdAt,
                    orderTotal: order.amount,
                    itemCount: order.products?.length || 0,
                    hasRefundDetails: !!refundDetails,
                    cancelReason: reason
                });
                
                // Send email with all the gathered information
                emailSent = await sendCancellationEmail(order, reason, refundDetails, userEmail);
                
                if (emailSent) {
                    console.log(`✅ Cancellation email successfully sent to ${userEmail}!`);
                } else {
                    console.log(`⚠️ Email sending returned false`);
                }
            } catch (emailError) {
                console.error(`❌ Error during email sending process:`, emailError.message);
            }
        } else {
            console.log(`⚠️ Cannot send email: No valid email address found for this order`);
        }
        
        return res.status(200).json({
            success: true,
            message: "Order cancelled successfully" + (emailSent ? " and notification email sent" : ""),
            emailSent: emailSent,
            emailAddress: userEmail || null,
            data: {
                orderId: order._id,
                status: order.status,
                refundDetails: refundDetails
            }
        });
    } catch (error) {
        console.error(`❌ Error cancelling order:`, error);
        return res.status(500).json({
            success: false,
            message: "Error cancelling order",
            error: error.message
        });
    }
});

/**
 * Get all orders for a specific user
 * Retrieves all orders associated with a given user ID
 */
router.get('/user/:userId', async (req, res) => {
    console.log(`📦 API CALL: GET /orders/user/${req.params.userId}`);
    
    try {
        const userId = req.params.userId;
        
        // Validate user ID format
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID format"
            });
        }
        
        // Extract query parameters for pagination and filtering
        const { status, startDate, endDate, limit, page } = req.query;
        
        // Build query object - always filter by userId
        const query = { userId: userId };
        
        // Add additional filters if provided
        if (status) {
            query.status = status;
        }
        
        // Date range filter
        if (startDate || endDate) {
            query.createdAt = {};
            
            if (startDate) {
                query.createdAt.$gte = new Date(startDate);
            }
            
            if (endDate) {
                query.createdAt.$lte = new Date(endDate);
            }
        }
        
        console.log(`🔍 Fetching orders for user: ${userId} with filters:`, query);
        
        // Set up pagination
        const pageSize = parseInt(limit) || 10;
        const currentPage = parseInt(page) || 1;
        const skip = (currentPage - 1) * pageSize;
        
        // Find orders with pagination
        const orders = await Order.find(query)
            .sort({ createdAt: -1 }) // Sort by newest first
            .skip(skip)
            .limit(pageSize);
            
        // Get total count for pagination
        const totalOrders = await Order.countDocuments(query);
        
        console.log(`✅ Found ${orders.length} orders for user ${userId} out of ${totalOrders} total`);
        
        return res.status(200).json({
            success: true,
            count: orders.length,
            total: totalOrders,
            page: currentPage,
            pages: Math.ceil(totalOrders / pageSize),
            data: orders
        });
    } catch (error) {
        console.error(`❌ Error fetching user orders:`, error);
        return res.status(500).json({
            success: false,
            message: "Error fetching user orders",
            error: error.message
        });
    }
});


module.exports = router;