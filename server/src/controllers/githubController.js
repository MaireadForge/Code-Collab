const axios = require('axios');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Filters for ignored paths/extensions
const IGNORED_PATTERNS = [
  /^node_modules\//,
  /^\.git\//,
  /^dist\//,
  /^build\//,
  /package-lock\.json$/,
  /\.png$/i,
  /\.jpg$/i,
  /\.jpeg$/i,
  /\.ico$/i,
  /\.svg$/i,
  /\.gif$/i,
  /\.webp$/i,
  /\.ttf$/i,
  /\.woff2?$/i,
  /\.eot$/i,
  /\.pdf$/i,
  /\.zip$/i,
  /\.tar$/i,
];

const MAX_FILE_SIZE = 100 * 1024; // 100 KB

const detectLanguage = (path) => {
  const ext = path.split('.').pop()?.toLowerCase();
  const langMap = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    cpp: 'cpp',
    cc: 'cpp',
    c: 'cpp',
    h: 'cpp',
    java: 'java',
    json: 'json',
    md: 'markdown',
    html: 'html',
    css: 'css',
    scss: 'css',
    sh: 'shell',
    yaml: 'yaml',
    yml: 'yaml',
    go: 'go',
    rs: 'rust',
    rb: 'ruby',
    php: 'php',
    cs: 'csharp',
    kt: 'kotlin',
    swift: 'swift',
    sql: 'sql',
    xml: 'xml',
    toml: 'toml',
  };
  return langMap[ext] || 'plaintext';
};

const parseGitHubUrl = (repoUrl) => {
  try {
    const url = new URL(repoUrl.trim());
    if (url.hostname !== 'github.com') {
      return null;
    }
    const parts = url.pathname.replace(/^\//, '').replace(/\/$/, '').split('/');
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
};

const githubHeaders = () => {
  const headers = { 'User-Agent': 'CodeCollab-App' };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
};

// POST /api/github/repo
const getRepoTree = async (req, res) => {
  try {
    const { repoUrl } = req.body;

    if (!repoUrl) {
      return res.status(400).json({ message: 'Repository URL is required' });
    }

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      return res.status(400).json({ message: 'Invalid GitHub URL. Use https://github.com/owner/repo format.' });
    }

    const { owner, repo } = parsed;

    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
      { headers: githubHeaders() }
    );

    if (response.data.truncated) {
      console.warn(`Tree truncated for ${owner}/${repo}`);
    }

    const tree = response.data.tree
      .filter((item) => {
        if (item.type !== 'blob') return false;
        if (item.size > MAX_FILE_SIZE) return false;
        const ignored = IGNORED_PATTERNS.some((pattern) => pattern.test(item.path));
        return !ignored;
      })
      .map((item) => ({
        path: item.path,
        type: item.type,
        size: item.size,
      }));

    return res.json({ tree, repoName: repo, owner });
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      if (status === 404) {
        return res.status(404).json({ message: 'Repository not found or is private.' });
      }
      if (status === 403) {
        const rateLimitRemaining = error.response.headers['x-ratelimit-remaining'];
        if (rateLimitRemaining === '0') {
          return res.status(429).json({
            message: 'GitHub API rate limit exceeded (60 requests/hour). Please try again later or add a GitHub token.',
          });
        }
        return res.status(403).json({ message: 'Access forbidden. Repository may be private.' });
      }
    }
    console.error('GitHub getRepoTree error:', error.message);
    return res.status(500).json({ message: 'Failed to fetch repository tree.' });
  }
};

// POST /api/github/file
const getFileContent = async (req, res) => {
  try {
    const { owner, repo, path } = req.body;

    if (!owner || !repo || !path) {
      return res.status(400).json({ message: 'owner, repo, and path are required' });
    }

    const response = await axios.get(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      { headers: githubHeaders() }
    );

    const raw = response.data.content;
    // GitHub returns base64 with newlines — strip them before decode
    const content = Buffer.from(raw.replace(/\n/g, ''), 'base64').toString('utf-8');
    const language = detectLanguage(path);

    return res.json({ content, path, language });
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      if (status === 404) {
        return res.status(404).json({ message: 'File not found.' });
      }
      if (status === 403) {
        const rateLimitRemaining = error.response.headers['x-ratelimit-remaining'];
        if (rateLimitRemaining === '0') {
          return res.status(429).json({
            message: 'GitHub API rate limit exceeded (60 requests/hour). Please try again later.',
          });
        }
        return res.status(403).json({ message: 'Access forbidden.' });
      }
    }
    console.error('GitHub getFileContent error:', error.message);
    return res.status(500).json({ message: 'Failed to fetch file content.' });
  }
};

// POST /api/github/analyze
const analyzeFileWithAI = async (req, res) => {
  try {
    const { content, path, language, action, allFiles } = req.body;

    if (!content || !path || !action) {
      return res.status(400).json({ message: 'content, path, and action are required' });
    }

    const fileName = path.split('/').pop();

    const prompts = {
      explain: {
        system: 'You are an expert software engineer and code tutor. Explain code clearly and concisely.',
        user: `Explain what this file does in the codebase.

File: ${path}
Language: ${language || 'unknown'}

\`\`\`${language || ''}
${content}
\`\`\`

Provide:
1. **Purpose**: What this file does
2. **Key Functions/Components**: The main functions, classes, or components and what they do
3. **Important Logic**: Any noteworthy algorithms or patterns used`,
      },
      connections: {
        system: 'You are an expert software architect who understands code dependencies and relationships.',
        user: `Analyze how this file connects to and interacts with the rest of the codebase.

File: ${path}
Language: ${language || 'unknown'}

File content:
\`\`\`${language || ''}
${content}
\`\`\`

Other files in the project:
${allFiles && allFiles.length > 0 ? allFiles.slice(0, 100).join('\n') : 'Not provided'}

Explain:
1. **Imports/Dependencies**: What this file imports and depends on
2. **Exports**: What this file exports for others to use
3. **Relationships**: Which other files likely interact with this file and how
4. **Role in Architecture**: This file's role in the overall project structure`,
      },
      bugs: {
        system: 'You are an expert code reviewer and security auditor. Find bugs, vulnerabilities, and code smells.',
        user: `Review this file for potential bugs and issues.

File: ${path}
Language: ${language || 'unknown'}

\`\`\`${language || ''}
${content}
\`\`\`

Report:
1. **Bugs**: Logical errors or incorrect behavior
2. **Edge Cases**: Unhandled edge cases
3. **Error Handling**: Missing or improper error handling
4. **Security Issues**: Potential security vulnerabilities
5. **Code Quality**: Code smells or anti-patterns
6. **Overall Assessment**: Severity rating (Low / Medium / High)

If no issues found, clearly state the code looks correct.`,
      },
      summary: {
        system: 'You are a technical writer. Provide extremely concise, one-line summaries of code files.',
        user: `Give a single sentence (max 20 words) describing what ${fileName} does.

\`\`\`${language || ''}
${content.slice(0, 3000)}
\`\`\`

Respond with ONLY the one-line summary, nothing else.`,
      },
    };

    const promptConfig = prompts[action];
    if (!promptConfig) {
      return res.status(400).json({ message: `Invalid action: ${action}` });
    }

    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: promptConfig.system },
        { role: 'user', content: promptConfig.user },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 1024,
    });

    const result = completion.choices[0]?.message?.content || 'No response generated.';
    return res.json({ result });
  } catch (error) {
    console.error('GitHub analyzeFileWithAI error:', error.message);
    return res.status(500).json({ message: 'AI analysis failed. Please try again.' });
  }
};

module.exports = { getRepoTree, getFileContent, analyzeFileWithAI };
