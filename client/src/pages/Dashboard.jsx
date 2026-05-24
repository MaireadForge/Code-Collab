import { useState, useEffect, useContext } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../utils/api';

const LANGUAGES = ['javascript', 'python', 'cpp', 'java'];

function Dashboard() {
  const { user, token, logout, loading: authLoading } = useContext(AuthContext);
  const navigate = useNavigate();

  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [creating, setCreating] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRooms = rooms.filter((room) =>
    room.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    if (!token) return;

    const fetchRooms = async () => {
      try {
        const { data } = await api.get('/rooms');
        setRooms(data.rooms);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load rooms');
      } finally {
        setRoomsLoading(false);
      }
    };

    fetchRooms();
  }, [token]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!roomName.trim()) return;

    setCreating(true);
    setError('');

    try {
      const { data } = await api.post('/rooms/create', {
        name: roomName.trim(),
        language,
      });
      setRooms((prev) => [data.room, ...prev]);
      setShowModal(false);
      setRoomName('');
      setLanguage('javascript');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-blue-400">CodeCollab</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-300 text-sm">
              Welcome, <span className="text-white font-medium">{user?.name}</span>
            </span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-200">Your Rooms</h2>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
          >
            + Create Room
          </button>
        </div>

        <div className="flex items-center gap-3 mb-8">
          <input
            type="text"
            value={joinRoomId}
            onChange={(e) => setJoinRoomId(e.target.value)}
            placeholder="Enter Room ID"
            className="flex-1 max-w-xs px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => {
              if (joinRoomId.trim()) {
                navigate(`/room/${joinRoomId.trim()}`);
              }
            }}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
          >
            Join
          </button>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {!roomsLoading && rooms.length > 0 && (
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search rooms..."
            className="w-full mb-4 px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}

        {roomsLoading ? (
          <p className="text-gray-400">Loading rooms...</p>
        ) : rooms.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-12 text-center border border-gray-700">
            <p className="text-gray-400">No rooms yet. Create one to get started!</p>
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-12 text-center border border-gray-700">
            <p className="text-gray-400">No rooms match your search.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRooms.map((room) => (
              <div
                key={room.roomId}
                className="bg-gray-800 rounded-xl p-5 border border-gray-700 hover:border-gray-600 transition-colors"
              >
                <h3 className="text-lg font-semibold text-white mb-1">{room.name}</h3>
                <p className="text-sm text-gray-400 mb-1">
                  Language: <span className="text-gray-300 capitalize">{room.language}</span>
                </p>
                <p className="text-sm text-gray-500 mb-4 font-mono">ID: {room.roomId}</p>
                <button
                  onClick={() => navigate(`/room/${room.roomId}`)}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Join
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50">
          <div className="w-full max-w-md bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-xl">
            <h3 className="text-xl font-semibold mb-4">Create New Room</h3>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label htmlFor="roomName" className="block text-sm font-medium text-gray-300 mb-1">
                  Room Name
                </label>
                <input
                  id="roomName"
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="My Awesome Room"
                />
              </div>

              <div>
                <label htmlFor="language" className="block text-sm font-medium text-gray-300 mb-1">
                  Language
                </label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setRoomName('');
                    setLanguage('javascript');
                  }}
                  className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-lg font-medium transition-colors"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
