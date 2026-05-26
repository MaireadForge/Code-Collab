const vm = require('vm');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const executeJavaScript = (code, stdin) => {
  return new Promise((resolve) => {
    const logs = [];
    const errors = [];

    // Parse stdin lines for prompt() simulation
    const stdinLines = stdin ? stdin.split('\n').filter(line => line !== '') : [];
    let stdinIndex = 0;

    const sandbox = {
      console: {
        log: (...args) => logs.push(args.map(a => {
          if (typeof a === 'object') return JSON.stringify(a, null, 2);
          return String(a);
        }).join(' ')),
        error: (...args) => errors.push(args.map(a => String(a)).join(' ')),
        warn: (...args) => logs.push(args.map(a => String(a)).join(' ')),
        info: (...args) => logs.push(args.map(a => String(a)).join(' ')),
      },
      // Simulate prompt() using stdin lines
      prompt: (message) => {
        if (message) logs.push(String(message));
        const value = stdinLines[stdinIndex] ?? '';
        stdinIndex++;
        return value;
      },
      // Simulate readline
      readline: {
        question: (msg, cb) => {
          if (msg) logs.push(String(msg));
          const value = stdinLines[stdinIndex] ?? '';
          stdinIndex++;
          if (cb) cb(value);
          return value;
        }
      },
      Math,
      JSON,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      Number,
      String,
      Boolean,
      Array,
      Object,
      Date,
      RegExp,
      Error,
      Map,
      Set,
      Promise,
    };

    try {
      vm.runInNewContext(code, sandbox, { timeout: 5000 });
      resolve({
        stdout: logs.join('\n'),
        stderr: errors.join('\n'),
        code: errors.length > 0 ? 1 : 0,
      });
    } catch (err) {
      resolve({
        stdout: logs.join('\n'),
        stderr: err.message,
        code: 1,
      });
    }
  });
};

const executeWithGroq = async (language, code, stdin) => {
  const languageNames = { python: 'Python', cpp: 'C++', java: 'Java' };
  const langName = languageNames[language] || language;

  const stdinSection = stdin && stdin.trim()
    ? `\nInput (stdin) provided by user:\n${stdin.trim()}`
    : '\nNo stdin provided. If the program requires input, simulate with empty/default values.';

  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `You are a ${langName} interpreter. Execute the given code mentally using the provided stdin input and return ONLY the exact output the program would produce.
Rules:
- Return ONLY the program output, nothing else
- No explanations, no markdown formatting, no code blocks
- Use the provided stdin values line by line when the program reads input
- If there would be a runtime error, return the exact error message
- If there would be a compilation error, return the exact compiler error
- If there is no output, return an empty string
- Be precise — simulate the exact behavior of a real ${langName} interpreter`
      },
      {
        role: 'user',
        content: `Execute this ${langName} code and return only the output:\n\n${code}${stdinSection}`
      }
    ],
    model: 'llama-3.3-70b-versatile',
    temperature: 0,
    max_tokens: 512,
  });

  const output = completion.choices[0]?.message?.content || '';

  const cleaned = output
    .replace(/```[\w]*\n?/g, '')
    .replace(/```/g, '')
    .trim();

  return {
    stdout: cleaned,
    stderr: '',
    code: 0,
  };
};

const executeCode = async (req, res) => {
  try {
    const { language, code, stdin } = req.body;

    if (!language || code === undefined) {
      return res.status(400).json({ message: 'Please provide language and code' });
    }

    if (!code.trim()) {
      return res.json({ stdout: '', stderr: '', code: 0 });
    }

    let result;

    if (language === 'javascript') {
      result = await executeJavaScript(code, stdin || '');
    } else if (['python', 'cpp', 'java'].includes(language)) {
      result = await executeWithGroq(language, code, stdin || '');
    } else {
      return res.status(400).json({ message: 'Unsupported language' });
    }

    return res.json(result);
  } catch (error) {
    console.error('Execution error:', error.message);
    return res.status(500).json({
      message: 'Execution failed',
      error: error.message,
      stdout: '',
      stderr: error.message,
      code: 1,
    });
  }
};

module.exports = { executeCode };
