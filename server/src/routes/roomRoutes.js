const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const {
  createRoom,
  joinRoom,
  getRoomDetails,
  getUserRooms,
} = require('../controllers/roomController');

const router = express.Router();

router.use(authMiddleware);

router.post('/create', createRoom);
router.post('/join', joinRoom);
router.get('/', getUserRooms);
router.get('/:roomId', getRoomDetails);

module.exports = router;
