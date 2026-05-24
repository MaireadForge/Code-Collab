const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const getPromptConfig = (action, language, code) => {
  const configs = {
    explain: {
      system: 'You are an expert programming tutor helping developers understand code.',
      prompt: `Analyze the following ${language} code and provide:
1. **What it does**: A clear, concise explanation of the code's purpose
2. **How it works**: Step-by-step breakdown of the logic
3. **Key concepts**: Important programming concepts used
Keep the explanation beginner-friendly but thorough.

Code:
${code}`,
    },
    debug: {
      system: 'You are an expert code reviewer and debugging specialist.',
      prompt: `Review the following ${language} code for issues:
1. **Bugs**: Any logical errors or bugs found
2. **Edge Cases**: Potential edge cases not handled
3. **Error Handling**: Missing error handling
4. **Security Issues**: Any security vulnerabilities
5. **Fixed Code**: Provide corrected version if issues found

If no issues found, say so clearly.

Code:
${code}`,
    },
    optimize: {
      system: 'You are a senior software engineer focused on code quality and performance.',
      prompt: `Analyze the following ${language} code for optimization opportunities:
1. **Performance**: Ways to improve speed or efficiency
2. **Readability**: How to make the code cleaner and more maintainable
3. **Best Practices**: Industry best practices not being followed
4. **Optimized Version**: Provide an improved version of the code

Code:
${code}`,
    },
    complexity: {
      system: 'You are a computer science professor specializing in algorithms and data structures.',
      prompt: `Analyze the computational complexity of the following ${language} code:
1. **Time Complexity**: Big O notation with explanation
2. **Space Complexity**: Memory usage analysis
3. **Best Case**: Best case scenario
4. **Worst Case**: Worst case scenario
5. **Average Case**: Average case analysis
6. **Bottlenecks**: Identify the most expensive operations
7. **Optimization Suggestions**: How to improve complexity if possible

Code:
${code}`,
    },
    testcases: {
      system: 'You are a QA engineer and testing specialist.',
      prompt: `Generate comprehensive test cases for the following ${language} code:
1. **Happy Path Tests**: Normal expected inputs and outputs
2. **Edge Cases**: Boundary conditions and edge cases
3. **Error Cases**: Invalid inputs and error scenarios
4. **Sample Test Code**: Write actual test cases in ${language}

Code:
${code}`,
    },
  };

  return configs[action];
};

const analyzeCode = async (req, res) => {
  try {
    const { code, language, action } = req.body;

    if (!code || !language || !action) {
      return res.status(400).json({ message: 'Please provide code, language, and action' });
    }

    const promptConfig = getPromptConfig(action, language, code);

    if (!promptConfig) {
      return res.status(400).json({ message: 'Invalid action' });
    }

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: promptConfig.system },
        { role: 'user', content: promptConfig.prompt },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 2048,
    });

    const result = completion.choices[0]?.message?.content || 'No response generated';

    res.json({ result });
  } catch (error) {
    console.error('AI Error:', error.message);
    res.status(500).json({
      message: 'AI analysis failed',
      error: error.message,
    });
  }
};

module.exports = { analyzeCode };
