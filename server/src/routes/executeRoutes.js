const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { executeCode } = require('../controllers/executeController');

const router = express.Router();

router.use(authMiddleware);
router.post('/', executeCode);

module.exports = router;
