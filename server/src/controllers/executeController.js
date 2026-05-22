const axios = require('axios');

const LANGUAGE_MAP = {
  javascript: 'javascript',
  python: 'python',
  cpp: 'c++',
  java: 'java',
};

const executeCode = async (req, res) => {
  try {
    const { language, code } = req.body;

    if (!language || code === undefined) {
      return res.status(400).json({ message: 'Please provide language and code' });
    }

    const pistonLanguage = LANGUAGE_MAP[language];

    if (!pistonLanguage) {
      return res.status(400).json({ message: 'Unsupported language' });
    }

    const response = await axios.post('https://emkc.org/api/v2/piston/execute', {
      language: pistonLanguage,
      version: '*',
      files: [{ content: code }],
    });

    const { stdout, stderr, code: exitCode } = response.data.run;

    res.json({ stdout, stderr, code: exitCode });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    res.status(500).json({ message: 'Execution failed', error: message });
  }
};

module.exports = { executeCode };
