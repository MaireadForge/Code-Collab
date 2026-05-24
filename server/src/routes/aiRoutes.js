const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { analyzeCode } = require('../controllers/aiController');

const router = express.Router();

router.use(authMiddleware);
router.post('/analyze', analyzeCode);

module.exports = router;
