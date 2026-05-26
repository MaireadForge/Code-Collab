const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { getRepoTree, getFileContent, analyzeFileWithAI } = require('../controllers/githubController');

const router = express.Router();

router.use(authMiddleware);

router.post('/repo', getRepoTree);
router.post('/file', getFileContent);
router.post('/analyze', analyzeFileWithAI);

module.exports = router;
