import { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { io } from 'socket.io-client';
import { AuthContext } from '../context/AuthContext';
import api from '../utils/api';

const LANGUAGES = ['javascript', 'python', 'cpp', 'java'];

const CURSOR_COLORS = [
  '#ef4444',
  '#22c55e',
  '#3b82f6',
  '#eab308',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#f97316',
];

const getUserColorIndex = (userId) => {
  if (!userId) return 0;
  const str = String(userId);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % CURSOR_COLORS.length;
};

const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const AI_ACTIONS = [
  { id: 'explain', label: 'Explain', emoji: '💡' },
  { id: 'debug', label: 'Debug', emoji: '🐛' },
  { id: 'optimize', label: 'Optimize', emoji: '⚡' },
  { id: 'complexity', label: 'Complexity', emoji: '📊' },
  { id: 'testcases', label: 'Test Cases', emoji: '🧪' },
];

const GITHUB_AI_ACTIONS = [
  { id: 'explain', label: 'Explain', emoji: '💡' },
  { id: 'connections', label: 'Connections', emoji: '🔗' },
  { id: 'bugs', label: 'Find Bugs', emoji: '🐛' },
  { id: 'summary', label: 'Summary', emoji: '📝' },
];

const EDITOR_THEMES = [
  { value: 'vs-dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'hc-black', label: 'High Contrast' },
];

// ─── File Tree helpers ────────────────────────────────────────────────────────
const buildFileTree = (files) => {
  const root = {};
  files.forEach(({ path, size }) => {
    const parts = path.split('/');
    let node = root;
    parts.forEach((part, idx) => {
      if (!node[part]) {
        node[part] = idx === parts.length - 1 ? { __file: true, path, size } : {};
      }
      node = node[part];
    });
  });
  return root;
};

const FILE_EXT_COLORS = {
  js: '#f7df1e',
  jsx: '#61dafb',
  ts: '#3178c6',
  tsx: '#61dafb',
  py: '#3572A5',
  java: '#b07219',
  cpp: '#f34b7d',
  c: '#555555',
  h: '#555555',
  json: '#a6e22e',
  md: '#083fa1',
  html: '#e34c26',
  css: '#563d7c',
  scss: '#c6538c',
  go: '#00ADD8',
  rs: '#dea584',
  sh: '#89e051',
  yaml: '#cb171e',
  yml: '#cb171e',
  sql: '#e38c00',
  default: '#6b7280',
};

const getExtColor = (filename) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return FILE_EXT_COLORS[ext] || FILE_EXT_COLORS.default;
};

// ─── FileTreeNode component ───────────────────────────────────────────────────
function FileTreeNode({ name, node, selectedPath, onFileClick, depth = 0 }) {
  const [open, setOpen] = useState(depth < 2);

  if (node.__file) {
    const color = getExtColor(name);
    const isSelected = node.path === selectedPath;
    return (
      <button
        onClick={() => onFileClick(node.path)}
        className={`w-full text-left flex items-center gap-1.5 px-2 py-0.5 rounded text-xs transition-colors truncate ${isSelected
            ? 'bg-blue-600 text-white'
            : 'text-gray-300 hover:bg-gray-700 hover:text-white'
          }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        title={node.path}
      >
        <span
          className="shrink-0 w-2 h-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="truncate">{name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left flex items-center gap-1.5 px-2 py-0.5 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 transition-colors"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <span className="shrink-0 text-gray-500">{open ? '▾' : '▸'}</span>
        <span className="truncate font-medium">{name}</span>
      </button>
      {open && (
        <div>
          {Object.entries(node)
            .sort(([, a], [, b]) => {
              // folders first, then files
              const aIsFile = a.__file ? 1 : 0;
              const bIsFile = b.__file ? 1 : 0;
              return aIsFile - bIsFile || 0;
            })
            .map(([childName, childNode]) => (
              <FileTreeNode
                key={childName}
                name={childName}
                node={childNode}
                selectedPath={selectedPath}
                onFileClick={onFileClick}
                depth={depth + 1}
              />
            ))}
        </div>
      )}
    </div>
  );
}

// ─── GitHubExplorerPanel component ────────────────────────────────────────────
function GitHubExplorerPanel({
  onClose,
  onFileLoad,
  roomId,
  socketRef,
  githubState,
  setGithubState,
}) {
  const {
    repoUrl,
    repoTree,
    repoName,
    owner,
    selectedPath,
    fileLoading,
    repoLoading,
    repoError,
    ghAiAction,
    ghAiResult,
    ghAiLoading,
  } = githubState;

  const set = (patch) => setGithubState((prev) => ({ ...prev, ...patch }));

  const fileTree = repoTree.length > 0 ? buildFileTree(repoTree) : null;
  const allFilePaths = repoTree.map((f) => f.path);

  const handleLoadRepo = async () => {
    if (!repoUrl.trim()) return;
    set({ repoLoading: true, repoError: '', repoTree: [], selectedPath: '', ghAiResult: '' });
    try {
      const { data } = await api.post('/github/repo', { repoUrl });
      set({ repoTree: data.tree, repoName: data.repoName, owner: data.owner, repoLoading: false });
    } catch (err) {
      const msg =
        err.response?.data?.message || 'Failed to load repository. It may be private or invalid.';
      set({ repoError: msg, repoLoading: false });
    }
  };

  const handleFileClick = async (path) => {
    if (selectedPath === path) return;
    set({ selectedPath: path, fileLoading: true, ghAiResult: '', ghAiAction: '' });
    try {
      const { data } = await api.post('/github/file', { owner, repo: repoName, path });
      onFileLoad({ path, content: data.content, language: data.language, repoUrl });
      // Emit to other users
      socketRef.current?.emit('github-file-load', {
        roomId,
        repoUrl,
        filePath: path,
        content: data.content,
        language: data.language,
      });
      set({ fileLoading: false });
    } catch (err) {
      console.error('Failed to load file:', err.message);
      set({ fileLoading: false });
    }
  };

  const handleGhAiAction = async (action) => {
    if (!selectedPath) return;
    set({ ghAiAction: action, ghAiLoading: true, ghAiResult: '' });
    try {
      // Get current file content from editor (we stored it in githubState.currentFileContent)
      const { data } = await api.post('/github/analyze', {
        content: githubState.currentFileContent,
        path: selectedPath,
        language: githubState.currentFileLang,
        action,
        allFiles: allFilePaths,
      });
      set({ ghAiResult: data.result, ghAiLoading: false });
    } catch (err) {
      set({
        ghAiResult: err.response?.data?.message || 'AI analysis failed.',
        ghAiLoading: false,
      });
    }
  };

  const fileName = selectedPath ? selectedPath.split('/').pop() : '';

  return (
    <aside className="w-[380px] shrink-0 h-full overflow-hidden flex flex-col min-h-0 bg-gray-900 border-r border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">🐙</span>
          <h2 className="text-sm font-semibold text-white">GitHub Explorer</h2>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg leading-none transition-colors"
          aria-label="Close GitHub Explorer panel"
        >
          ✕
        </button>
      </div>

      {/* Repo Input */}
      <div className="px-3 py-3 border-b border-gray-700 shrink-0 space-y-2">
        <input
          type="url"
          value={repoUrl}
          onChange={(e) => set({ repoUrl: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && handleLoadRepo()}
          placeholder="https://github.com/owner/repo"
          className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          id="github-repo-url-input"
        />
        <button
          onClick={handleLoadRepo}
          disabled={repoLoading || !repoUrl.trim()}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg text-xs font-semibold text-white transition-colors flex items-center justify-center gap-2"
          id="github-load-repo-btn"
        >
          {repoLoading ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Loading...
            </>
          ) : (
            'Load Repository'
          )}
        </button>
        {repoError && (
          <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">
            {repoError}
          </p>
        )}
      </div>

      {/* File Tree */}
      {fileTree && (
        <div className="flex-1 min-h-0 overflow-y-auto py-2 border-b border-gray-700">
          <div className="px-3 pb-2 flex items-center gap-2">
            <span className="text-xs font-bold text-gray-200 truncate">
              📁 {repoName}
            </span>
            <span className="text-xs text-gray-500 shrink-0">
              ({repoTree.length} files)
            </span>
          </div>
          {Object.entries(fileTree)
            .sort(([, a], [, b]) => {
              const aIsFile = a.__file ? 1 : 0;
              const bIsFile = b.__file ? 1 : 0;
              return aIsFile - bIsFile;
            })
            .map(([name, node]) => (
              <FileTreeNode
                key={name}
                name={name}
                node={node}
                selectedPath={selectedPath}
                onFileClick={handleFileClick}
                depth={0}
              />
            ))}
        </div>
      )}

      {/* File Actions */}
      {selectedPath && (
        <div className="shrink-0 border-t border-gray-700 flex flex-col" style={{ maxHeight: '280px' }}>
          <div className="px-3 py-2 border-b border-gray-700 shrink-0">
            {fileLoading ? (
              <div className="flex items-center gap-2 text-gray-400 text-xs">
                <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Loading file...
              </div>
            ) : (
              <p className="text-xs text-blue-400 font-mono truncate" title={selectedPath}>
                📄 {fileName}
              </p>
            )}
          </div>

          {/* AI action buttons */}
          <div className="flex flex-wrap gap-1.5 p-3 border-b border-gray-700 shrink-0">
            {GITHUB_AI_ACTIONS.map(({ id, label, emoji }) => (
              <button
                key={id}
                onClick={() => handleGhAiAction(id)}
                disabled={ghAiLoading || fileLoading}
                id={`gh-ai-${id}`}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${ghAiAction === id
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
              >
                {emoji} {label}
              </button>
            ))}
          </div>

          {/* AI Result */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {ghAiLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                <div className="w-7 h-7 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs">Analyzing file...</p>
              </div>
            ) : ghAiResult ? (
              <pre className="text-xs text-gray-200 whitespace-pre-wrap leading-relaxed">{ghAiResult}</pre>
            ) : (
              <p className="text-xs text-gray-500 text-center mt-4">
                Select an action to analyze this file with AI
              </p>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!fileTree && !repoLoading && !repoError && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500 px-6">
          <span className="text-4xl">🐙</span>
          <p className="text-xs text-center">
            Enter a public GitHub repository URL above to browse its files.
          </p>
          <p className="text-xs text-center text-gray-600">
            Rate limit: 60 requests/hour unauthenticated
          </p>
        </div>
      )}
    </aside>
  );
}

// ─── Room component ───────────────────────────────────────────────────────────
function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, token, loading: authLoading } = useContext(AuthContext);

  const [room, setRoom] = useState(null);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({});
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [activeTab, setActiveTab] = useState('participants');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [output, setOutput] = useState({ stdout: '', stderr: '', code: null });
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showGitHubPanel, setShowGitHubPanel] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [aiAction, setAiAction] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [editorTheme, setEditorTheme] = useState('vs-dark');
  const [fontSize, setFontSize] = useState(14);

  // GitHub Explorer state
  const [githubMode, setGithubMode] = useState(false); // is editor in GitHub view-only mode?
  const [githubBannerFile, setGithubBannerFile] = useState('');
  const originalCodeRef = useRef(''); // store room code before GitHub mode
  const originalLanguageRef = useRef('javascript');

  const [githubState, setGithubState] = useState({
    repoUrl: '',
    repoTree: [],
    repoName: '',
    owner: '',
    selectedPath: '',
    fileLoading: false,
    repoLoading: false,
    repoError: '',
    ghAiAction: '',
    ghAiResult: '',
    ghAiLoading: false,
    currentFileContent: '',
    currentFileLang: 'plaintext',
  });

  const socketRef = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationIdsRef = useRef([]);
  const isLocalChange = useRef(true);
  const saveTimeoutRef = useRef(null);
  const chatEndRef = useRef(null);

  const userId = user?.id || user?._id;

  const scrollChatToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollChatToBottom();
  }, [messages, scrollChatToBottom]);

  const updateCursorDecorations = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const decorations = Object.entries(remoteCursors).map(([id, cursor]) => {
      const colorIndex = getUserColorIndex(id);
      return {
        range: new monaco.Range(
          cursor.lineNumber,
          cursor.column,
          cursor.lineNumber,
          cursor.column
        ),
        options: {
          className: `remote-cursor-${colorIndex}`,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      };
    });

    decorationIdsRef.current = editor.deltaDecorations(
      decorationIdsRef.current,
      decorations
    );
  }, [remoteCursors]);

  useEffect(() => {
    updateCursorDecorations();
  }, [remoteCursors, updateCursorDecorations]);

  useEffect(() => {
    if (authLoading) return;
    if (!token) return;

    const fetchRoom = async () => {
      try {
        await api.post('/rooms/join', { roomId });
        const { data } = await api.get(`/rooms/${roomId}`);
        setRoom(data.room);
        setCode(data.room.code || '');
        setLanguage(data.room.language || 'javascript');
        originalCodeRef.current = data.room.code || '';
        originalLanguageRef.current = data.room.language || 'javascript';
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load room');
      } finally {
        setLoading(false);
      }
    };

    fetchRoom();
  }, [roomId, token, authLoading]);

  // ─── Socket setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !userId || loading || error) return;

    const socket = io(import.meta.env.VITE_SOCKET_URL);
    socketRef.current = socket;

    const onConnect = () => {
      socket.emit('join-room', {
        roomId,
        userId,
        name: user.name,
      });
    };

    const onRoomUsers = (users) => {
      setConnectedUsers(users);
    };

    const onCodeChange = ({ code: newCode }) => {
      isLocalChange.current = false;
      setCode(newCode);
    };

    const onLanguageChange = ({ language: newLanguage }) => {
      setLanguage(newLanguage);
    };

    const onCursorChange = ({ userId: remoteUserId, name, lineNumber, column }) => {
      if (String(remoteUserId) === String(userId)) return;

      setRemoteCursors((prev) => ({
        ...prev,
        [remoteUserId]: { userId: remoteUserId, name, lineNumber, column },
      }));
    };

    const onChatHistory = (history) => {
      setMessages(history);
    };

    const onReceiveMessage = (message) => {
      setMessages((prev) => [...prev, message]);
    };

    // GitHub sync handlers
    const onGithubFileLoad = ({ repoUrl, filePath, content, language: lang }) => {
      // Another user loaded a GitHub file — enter GitHub mode silently
      originalCodeRef.current = code;
      originalLanguageRef.current = language;
      setCode(content);
      setLanguage(lang);
      setGithubMode(true);
      setGithubBannerFile(filePath.split('/').pop());
      setGithubState((prev) => ({
        ...prev,
        repoUrl,
        selectedPath: filePath,
        currentFileContent: content,
        currentFileLang: lang,
      }));
    };

    const onGithubExit = () => {
      setCode(originalCodeRef.current);
      setLanguage(originalLanguageRef.current);
      setGithubMode(false);
      setGithubBannerFile('');
    };

    socket.on('connect', onConnect);
    socket.on('room-users', onRoomUsers);
    socket.on('code-change', onCodeChange);
    socket.on('language-change', onLanguageChange);
    socket.on('cursor-change', onCursorChange);
    socket.on('chat-history', onChatHistory);
    socket.on('receive-message', onReceiveMessage);
    socket.on('github-file-load', onGithubFileLoad);
    socket.on('github-exit', onGithubExit);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      socket.off('connect', onConnect);
      socket.off('room-users', onRoomUsers);
      socket.off('code-change', onCodeChange);
      socket.off('language-change', onLanguageChange);
      socket.off('cursor-change', onCursorChange);
      socket.off('chat-history', onChatHistory);
      socket.off('receive-message', onReceiveMessage);
      socket.off('github-file-load', onGithubFileLoad);
      socket.off('github-exit', onGithubExit);
      socket.emit('leave-room', { roomId });
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, token, userId, user?.name, loading, error]);

  const saveCodeToBackend = useCallback(
    (codeValue) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await api.patch(`/rooms/${roomId}/code`, { code: codeValue });
        } catch (err) {
          console.error('Failed to save code:', err.response?.data?.message);
        }
      }, 1000);
    },
    [roomId]
  );

  const handleCodeChange = (value) => {
    const newCode = value ?? '';
    setCode(newCode);

    if (isLocalChange.current) {
      socketRef.current?.emit('code-change', { roomId, code: newCode });
      saveCodeToBackend(newCode);
    }

    isLocalChange.current = true;
  };

  const handleLanguageChange = async (e) => {
    const newLanguage = e.target.value;
    setLanguage(newLanguage);
    socketRef.current?.emit('language-change', { roomId, language: newLanguage });

    try {
      await api.patch(`/rooms/${roomId}/language`, { language: newLanguage });
    } catch (err) {
      console.error('Failed to save language:', err.response?.data?.message);
    }
  };

  const handleEditorMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.onDidChangeCursorPosition((e) => {
      const { lineNumber, column } = e.position;
      socketRef.current?.emit('cursor-change', {
        roomId,
        userId,
        name: user.name,
        lineNumber,
        column,
      });
    });
  };

  const handleLeaveRoom = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    socketRef.current?.emit('leave-room', { roomId });
    socketRef.current?.disconnect();
    navigate('/dashboard');
  };

  const handleSendMessage = () => {
    const content = chatInput.trim();
    if (!content) return;

    socketRef.current?.emit('send-message', {
      roomId,
      userId,
      name: user.name,
      content,
    });

    setChatInput('');
  };

  const handleChatKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getSelectedCode = () => {
    const editor = editorRef.current;
    if (!editor) return code;

    const selection = editor.getSelection();
    if (!selection || selection.isEmpty()) return code;

    const model = editor.getModel();
    if (!model) return code;

    const selectedText = model.getValueInRange(selection);
    return selectedText.trim() ? selectedText : code;
  };

  const handleAIAction = async (action) => {
    setAiAction(action);
    setShowAIPanel(true);
    setAiLoading(true);
    setAiResult('');

    try {
      const codeToAnalyze = getSelectedCode();
      const { data } = await api.post('/ai/analyze', {
        code: codeToAnalyze,
        language,
        action,
      });
      setAiResult(data.result);
    } catch (err) {
      setAiResult(err.response?.data?.message || 'AI analysis failed. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleRunCode = async () => {
    setRunning(true);
    setShowOutput(true);
    setOutput({ stdout: '', stderr: '', code: null });

    try {
      const { data } = await api.post('/execute', { language, code });
      setOutput({
        stdout: data.stdout || '',
        stderr: data.stderr || '',
        code: data.code,
      });
    } catch (err) {
      setOutput({
        stdout: '',
        stderr: err.response?.data?.message || 'Failed to execute code',
        code: 1,
      });
    } finally {
      setRunning(false);
    }
  };

  // ─── GitHub panel toggle ───────────────────────────────────────────────────
  const handleToggleGitHub = () => {
    setShowGitHubPanel((prev) => {
      const next = !prev;
      if (next) setShowAIPanel(false); // close AI panel when opening GitHub
      return next;
    });
  };

  const handleToggleAI = () => {
    setShowAIPanel((prev) => {
      const next = !prev;
      if (next) setShowGitHubPanel(false); // close GitHub panel when opening AI
      return next;
    });
  };

  // ─── GitHub file loaded into editor ───────────────────────────────────────
  const handleGitHubFileLoad = ({ path, content, language: lang, repoUrl }) => {
    originalCodeRef.current = githubMode ? originalCodeRef.current : code;
    originalLanguageRef.current = githubMode ? originalLanguageRef.current : language;
    setCode(content);
    setLanguage(lang);
    setGithubMode(true);
    setGithubBannerFile(path.split('/').pop());
    setGithubState((prev) => ({
      ...prev,
      currentFileContent: content,
      currentFileLang: lang,
    }));
  };

  // ─── Exit GitHub mode ──────────────────────────────────────────────────────
  const handleExitGitHubMode = () => {
    setCode(originalCodeRef.current);
    setLanguage(originalLanguageRef.current);
    setGithubMode(false);
    setGithubBannerFile('');
    setGithubState((prev) => ({
      ...prev,
      selectedPath: '',
      ghAiResult: '',
      ghAiAction: '',
    }));
    socketRef.current?.emit('github-exit', { roomId });
  };

  // ─── Render guards ─────────────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-gray-400">Loading room...</p>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-4">
        <p className="text-red-400">{error}</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  // Determine which left panel to show
  const leftPanel = showGitHubPanel ? 'github' : showAIPanel ? 'ai' : null;

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col overflow-hidden">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <header className="h-[60px] shrink-0 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4 gap-4">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <h1 className="text-lg font-bold text-blue-400 shrink-0">{room?.name || 'Room'}</h1>
          <select
            value={language}
            onChange={handleLanguageChange}
            disabled={githubMode}
            className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
          <select
            value={editorTheme}
            onChange={(e) => setEditorTheme(e.target.value)}
            className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {EDITOR_THEMES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFontSize((s) => Math.max(10, s - 1))}
              className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-sm"
              aria-label="Decrease font size"
            >
              A-
            </button>
            <button
              type="button"
              onClick={() => setFontSize((s) => Math.min(24, s + 1))}
              className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-sm"
              aria-label="Increase font size"
            >
              A+
            </button>
          </div>

          {/* AI Assistant button */}
          <button
            onClick={handleToggleAI}
            id="ai-assistant-btn"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${leftPanel === 'ai'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
          >
            🤖 AI Assistant
          </button>

          {/* GitHub Explorer button */}
          <button
            onClick={handleToggleGitHub}
            id="github-explorer-btn"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${leftPanel === 'github'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
          >
            🐙 GitHub
          </button>

          <button
            onClick={handleCopyLink}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600"
          >
            {linkCopied ? '✓ Copied!' : '🔗 Copy Link'}
          </button>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <span className="text-sm text-gray-400 whitespace-nowrap">
            {connectedUsers.length} user{connectedUsers.length !== 1 ? 's' : ''} online
          </span>
          <button
            onClick={handleLeaveRoom}
            className="px-4 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
          >
            Leave Room
          </button>
        </div>
      </header>

      {/* ─── Body ─────────────────────────────────────────────────────────── */}
      <div
        className="flex flex-row overflow-hidden min-h-0"
        style={{ height: 'calc(100vh - 60px)' }}
      >
        {/* Left panel — AI or GitHub, mutually exclusive */}
        {leftPanel === 'ai' && (
          <aside className="w-[380px] shrink-0 h-full overflow-hidden flex flex-col min-h-0 bg-gray-900 border-r border-gray-700">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
              <h2 className="text-sm font-semibold text-white">AI Assistant</h2>
              <button
                onClick={() => setShowAIPanel(false)}
                className="text-gray-400 hover:text-white text-lg leading-none"
                aria-label="Close AI panel"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-wrap gap-2 p-3 border-b border-gray-700 shrink-0">
              {AI_ACTIONS.map(({ id, label, emoji }) => (
                <button
                  key={id}
                  onClick={() => handleAIAction(id)}
                  disabled={aiLoading}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${aiAction === id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                >
                  {emoji} {label}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {aiLoading ? (
                <div className="flex flex-col items-center justify-center min-h-full gap-3 text-gray-400">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm">Analyzing your code...</p>
                </div>
              ) : aiResult ? (
                <pre className="text-sm text-gray-200 whitespace-pre-wrap">{aiResult}</pre>
              ) : (
                <p className="text-sm text-gray-500 text-center">
                  Select code or use full file, then click an action above
                </p>
              )}
            </div>
          </aside>
        )}

        {leftPanel === 'github' && (
          <GitHubExplorerPanel
            onClose={() => setShowGitHubPanel(false)}
            onFileLoad={handleGitHubFileLoad}
            roomId={roomId}
            socketRef={socketRef}
            githubState={githubState}
            setGithubState={setGithubState}
          />
        )}

        {/* ─── Main Editor ──────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden">
          {/* GitHub read-only banner */}
          {githubMode && (
            <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-amber-900/60 border-b border-amber-700/60 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-amber-400 text-sm shrink-0">🔒</span>
                <span className="text-amber-300 text-xs font-mono truncate">
                  Viewing: <strong>{githubBannerFile}</strong> — Read Only
                </span>
              </div>
              <button
                onClick={handleExitGitHubMode}
                id="exit-github-mode-btn"
                className="shrink-0 px-3 py-1 bg-amber-700 hover:bg-amber-600 rounded-lg text-xs font-semibold text-white transition-colors whitespace-nowrap"
              >
                ✕ Exit GitHub Mode
              </button>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-hidden" style={{ height: '100%' }}>
            <Editor
              height="100%"
              theme={editorTheme}
              language={language}
              value={code}
              onChange={handleCodeChange}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                readOnly: githubMode,
              }}
            />
          </div>

          {showOutput && (
            <div className="h-[200px] shrink-0 min-h-0 bg-gray-800 border-t border-gray-700 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
                <span className="text-sm font-medium text-gray-300">Output</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    Exit code: {output.code ?? '—'}
                  </span>
                  <button
                    onClick={() => setShowOutput(false)}
                    className="text-gray-400 hover:text-white text-sm"
                  >
                    ✕ Close
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-auto p-4 font-mono text-sm">
                {output.stdout && (
                  <pre className="text-green-400 whitespace-pre-wrap">{output.stdout}</pre>
                )}
                {output.stderr && (
                  <pre className="text-red-400 whitespace-pre-wrap">{output.stderr}</pre>
                )}
                {!output.stdout && !output.stderr && (
                  <p className="text-gray-500">No output</p>
                )}
              </div>
            </div>
          )}
        </main>

        {/* ─── Right sidebar ────────────────────────────────────────────────── */}
        <aside className="w-[250px] shrink-0 h-full min-h-0 overflow-hidden flex flex-col bg-gray-800 border-l border-gray-700">
          <div className="flex shrink-0 border-b border-gray-700">
            <button
              onClick={() => setActiveTab('participants')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${activeTab === 'participants'
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-200'
                }`}
            >
              Participants
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${activeTab === 'chat'
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-200'
                }`}
            >
              Chat
            </button>
          </div>

          {activeTab === 'participants' ? (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                {connectedUsers.length === 0 ? (
                  <p className="text-gray-500 text-sm">No users connected</p>
                ) : (
                  <ul className="space-y-2">
                    {connectedUsers.map((u) => {
                      const colorIndex = getUserColorIndex(u.userId);
                      const isYou = String(u.userId) === String(userId);
                      return (
                        <li key={u.socketId} className="flex items-center gap-2 text-sm">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: CURSOR_COLORS[colorIndex] }}
                          />
                          <span className="text-gray-200 truncate">
                            {u.name}
                            {isYou && <span className="text-gray-500"> (you)</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="shrink-0 p-4 border-t border-gray-700">
                <button
                  onClick={handleRunCode}
                  disabled={running || githubMode}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
                  title={githubMode ? 'Exit GitHub mode to run code' : ''}
                >
                  {running ? 'Running...' : 'Run Code'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
                {messages.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center">No messages yet</p>
                ) : (
                  messages.map((msg, index) => {
                    const color = CURSOR_COLORS[getUserColorIndex(msg.userId)];
                    return (
                      <div key={`${msg.timestamp}-${index}`} className="text-sm">
                        <div className="flex items-baseline justify-between gap-2 mb-0.5">
                          <span className="font-medium truncate" style={{ color }}>
                            {msg.name}
                          </span>
                          <span className="text-gray-500 text-xs shrink-0">
                            {formatTime(msg.timestamp)}
                          </span>
                        </div>
                        <p className="text-gray-300 break-words">{msg.content}</p>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="shrink-0 p-3 border-t border-gray-700 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSendMessage}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default Room;
