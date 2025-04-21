const express = require('express');
const router = express.Router();
const { 
    createRoomPlan, 
    getUserRoomPlans, 
    getRoomPlan,
    updateRoomPlan,
    deleteRoomPlan,
    addItemToRoomPlan,
    getRecommendations 
} = require('../controllers/roomPlannerController');


// Create a new room plan
router.post('/', createRoomPlan);

// Get all room plans for a user
router.get('/user', getUserRoomPlans);

// Get a specific room plan
router.get('/:id', getRoomPlan);

// Update a room plan
router.put('/:id', updateRoomPlan);

// Delete a room plan
router.delete('/:id', deleteRoomPlan);

// Add item to a room plan
router.post('/:id/items', addItemToRoomPlan);

// Get product recommendations based on room plan
router.get('/:id/recommendations', getRecommendations);

module.exports = router;