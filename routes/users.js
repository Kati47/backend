const express = require('express');
const router= express.Router();

const usersController= require('../controllers/users');

router.get('/count',usersController.getUserCount);
router.delete('/:id',usersController.deleteUser);
router.get('/usersTotal',usersController.getUsers);
router.get('/:id',usersController.getUserById);
router.put('/edit/:id',usersController.updateUser);
router.get('/:id/name', usersController.getUserNameById);
router.get('/:id/email', usersController.getUserEmailById);

module.exports=router;