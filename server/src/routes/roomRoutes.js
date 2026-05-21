const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const {
  createRoom,
  joinRoom,
  getRoomDetails,
  getUserRooms,
  updateRoomCode,
  updateRoomLanguage,
} = require('../controllers/roomController');

const router = express.Router();

router.use(authMiddleware);

router.post('/create', createRoom);
router.post('/join', joinRoom);
router.get('/', getUserRooms);
router.patch('/:roomId/code', updateRoomCode);
router.patch('/:roomId/language', updateRoomLanguage);
router.get('/:roomId', getRoomDetails);

module.exports = router;
