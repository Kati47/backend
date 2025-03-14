console.log('Loading admin users controller...');

const { User } = require('../models/user');
console.log('User model imported');

const {Token} = require("../models/token");
console.log('Token model imported');


exports.getUserCount = async function (req, res) {
    console.log('getUserCount function called');
    
    try {
        console.log('Attempting to count users...');
        const userCount = await User.countDocuments();
        console.log('User count result:', userCount);
        
        if (!userCount) {
            console.error('Failed to count users');
            return res.status(500).json({message: 'Could not count users'});
        }
        
        console.log('Successfully counted users:', userCount);
        return res.json({userCount});
        
    } catch (error) {
        console.error('Error in getUserCount:', error);
        return res.status(500).json({type: error.name, message: error.message});
    }
}

exports.deleteUser = async function(req, res) {
    console.log('deleteUser function called with params:', req.params);
    
    try {
        console.log('Extracting user ID from params...');
        const userId = req.params.id;
        console.log('User ID to delete:', userId);
        
        console.log('Checking if user exists...');
        const user = await User.findById(userId);
        console.log('User found:', user ? 'Yes' : 'No');
        
        if (!user) {
            console.error('User not found with ID:', userId);
            return res.status(404).json({message: 'User not Found'});
        }
        
        console.log('Updating user to remove cart items...');
        await User.findByIdAndUpdate(userId, {
            $pull: {cart: {$exists: true}},
        });
        console.log('Cart items removed');
        
        console.log('Deleting user document...');
        await User.deleteOne({_id: userId});
        console.log('User document deleted');
        
        console.log('Deleting associated tokens...');
        await Token.deleteOne({userId: userId});
        console.log('User tokens deleted');
        
        console.log('User deletion completed successfully');
        return res.status(204).end();
        
    } catch (error) {
        console.error('Error in deleteUser:', error);
        return res.status(500).json({type: error.name, message: error.message});
    }
}

exports.getUsers = async (_, res) => {
    console.log('getUsers function called');
    
    try {
        console.log('Fetching all users with selected fields...');
        const users = await User.find().select('name email id isAdmin');
        console.log('Users found:', users ? users.length : 0);
        
        if (!users) {
            console.error('No users found');
            return res.status(404).json({ message: 'User not Found' });
        }
        
        console.log('Successfully retrieved users list');
        return res.json(users);
    }
    catch (error) {
        console.error('Error in getUsers:', error);
        return res.status(500).json({ type: error.name, message: error.message });
    }
}

exports.getUserById = async (req, res) => {
    console.log('getUserById function called with params:', req.params);
    
    try {
        console.log('Extracting user ID from params...');
        const userId = req.params.id;
        console.log('Looking up user by ID:', userId);
        
        console.log('Fetching user with excluded fields...');
        const user = await User.findById(userId).select(
            '-passwordHash -resetPasswordOtp -resetPasswordOtpExpires -cart');
        console.log('User found:', user ? 'Yes' : 'No');
        
        if (!user) {
            console.error('User not found with ID:', userId);
            return res.status(404).json({ message: 'User Not Found' });
        }
        
        console.log('Successfully retrieved user details');
        return res.json(user);
    } catch (error) {
        console.error('Error in getUserById:', error);
        return res.status(500).json({ type: error.name, message: error.message });
    }
}

exports.updateUser = async (req, res) => {
    console.log('updateUser function called with params:', req.params);
    console.log('Request body:', req.body);
    
    try {
        console.log('Extracting fields from request body...');
        const { name, email, phone } = req.body;
        console.log('Fields to update:', { name, email, phone });
        
        console.log('Finding and updating user...');
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { name, email, phone },
            { new: true }
        );
        console.log('User updated:', user ? 'Yes' : 'No');
        
        if (!user) {
            console.error('User not found with ID:', req.params.id);
            return res.status(404).json({ message: 'User Not Found' });
        }
        
        console.log('Removing sensitive fields from response...');
        user.passwordHash = undefined;
        user.cart = undefined;
        
        console.log('Successfully updated user');
        return res.json(user);
    } catch (error) {
        console.error('Error in updateUser:', error);
        return res.status(500).json({ type: error.name, message: error.message });
    }
}