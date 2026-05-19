const { nanoid } = require('nanoid');
const Room = require('../models/Room');

const generateUniqueRoomId = async () => {
  let roomId;
  let exists = true;

  while (exists) {
    roomId = nanoid(8);
    exists = await Room.findOne({ roomId });
  }

  return roomId;
};

const createRoom = async (req, res) => {
  try {
    const { name, language } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Please provide a room name' });
    }

    const roomId = await generateUniqueRoomId();

    const room = await Room.create({
      roomId,
      name,
      language: language || 'javascript',
      owner: req.user.id,
      participants: [req.user.id],
    });

    await room.populate('owner', 'name email');
    await room.populate('participants', 'name email');

    res.status(201).json({
      message: 'Room created successfully',
      room,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const joinRoom = async (req, res) => {
  try {
    const { roomId } = req.body;

    if (!roomId) {
      return res.status(400).json({ message: 'Please provide a room ID' });
    }

    const room = await Room.findOne({ roomId, isActive: true });

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const isParticipant = room.participants.some(
      (p) => p.toString() === req.user.id
    );

    if (!isParticipant) {
      room.participants.push(req.user.id);
      await room.save();
    }

    await room.populate('owner', 'name email');
    await room.populate('participants', 'name email');

    res.json({
      message: 'Joined room successfully',
      room,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getRoomDetails = async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findOne({ roomId, isActive: true })
      .populate('owner', 'name email')
      .populate('participants', 'name email');

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    res.json({ room });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getUserRooms = async (req, res) => {
  try {
    const rooms = await Room.find({
      participants: req.user.id,
      isActive: true,
    })
      .populate('owner', 'name email')
      .populate('participants', 'name email')
      .sort({ createdAt: -1 });

    res.json({ rooms });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { createRoom, joinRoom, getRoomDetails, getUserRooms };
