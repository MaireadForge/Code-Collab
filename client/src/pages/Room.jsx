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
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [aiAction, setAiAction] = useState('');

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
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load room');
      } finally {
        setLoading(false);
      }
    };

    fetchRoom();
  }, [roomId, token, authLoading]);

  useEffect(() => {
    if (!token || !userId || loading || error) return;

    const socket = io('http://localhost:5000');
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

    socket.on('connect', onConnect);
    socket.on('room-users', onRoomUsers);
    socket.on('code-change', onCodeChange);
    socket.on('language-change', onLanguageChange);
    socket.on('cursor-change', onCursorChange);
    socket.on('chat-history', onChatHistory);
    socket.on('receive-message', onReceiveMessage);

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
      socket.emit('leave-room', { roomId });
      socket.disconnect();
      socketRef.current = null;
    };
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

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col overflow-hidden">
      <header className="h-[60px] shrink-0 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-blue-400">{room?.name || 'Room'}</h1>
          <select
            value={language}
            onChange={handleLanguageChange}
            className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowAIPanel((prev) => !prev)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showAIPanel
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            🤖 AI Assistant
          </button>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
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

      <div
        className="flex flex-row overflow-hidden min-h-0"
        style={{ height: 'calc(100vh - 60px)' }}
      >
        {showAIPanel && (
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
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                    aiAction === id
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

        <main className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden" style={{ height: '100%' }}>
            <Editor
              height="100%"
              theme="vs-dark"
              language={language}
              value={code}
              onChange={handleCodeChange}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
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

        <aside className="w-[250px] shrink-0 h-full min-h-0 overflow-hidden flex flex-col bg-gray-800 border-l border-gray-700">
          <div className="flex shrink-0 border-b border-gray-700">
            <button
              onClick={() => setActiveTab('participants')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'participants'
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Participants
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'chat'
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
                  disabled={running}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
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
