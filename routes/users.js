const express = require('express');
const router= express.Router();

const usersController= require('../controllers/users');

router.get('/users/count',usersController.getUserCount);
router.delete('/users/:id',usersController.deleteUser);
router.get('/usersTotal/',usersController.getUsers);
router.get('/user/:id',usersController.getUserById);
router.put('/edit/:id',usersController.updateUser);

module.exports=router;