# CodeCollab — Real-Time Collaborative Coding Platform

A full-stack real-time collaborative coding platform where multiple users can join rooms, write code together simultaneously, chat, and see each other's cursors live.

## 🚀 Live Demo
[https://code-collab-swart-sigma.vercel.app/](https://code-collab-swart-sigma.vercel.app/)


## ✨ Features

- **Real-Time Code Collaboration** — Multiple users editing code simultaneously with live synchronization
- **Live Cursor Tracking** — See other users' cursors in real time with unique color indicators
- **Room System** — Create and join coding rooms via unique room codes
- **Multi-Language Support** — JavaScript, Python, C++, and Java with syntax highlighting
- **Live Chat** — Real-time chat alongside the editor with message history
- **User Presence** — See who's currently in the room with colored indicators
- **Persistent State** — Code and language settings saved to database, late joiners see current state
- **JWT Authentication** — Secure register/login with token-based auth
- **Responsive UI** — Clean dark-themed interface built with Tailwind CSS

## 🛠️ Tech Stack

### Frontend
- React.js
- Tailwind CSS
- Monaco Editor (@monaco-editor/react)
- Socket.IO Client
- Axios
- React Router DOM

### Backend
- Node.js
- Express.js
- Socket.IO
- MongoDB Atlas (Mongoose)
- JWT (jsonwebtoken)
- bcryptjs

### DevOps
- Docker
- GitHub Actions (CI/CD)
- Render (Backend Deployment)
- Vercel (Frontend Deployment)

## 📁 Project Structure

```
Code_Collab/
├── client/                 # React frontend
│   ├── src/
│   │   ├── context/        # Auth context
│   │   ├── pages/          # Login, Register, Dashboard, Room
│   │   └── utils/          # Axios instance
│   └── vite.config.js
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── controllers/    # Auth, Room, Execute logic
│   │   ├── middleware/      # JWT auth middleware
│   │   ├── models/         # User, Room schemas
│   │   └── routes/         # API routes
│   └── server.js
└── README.md
```

## ⚙️ Getting Started

### Prerequisites
- Node.js v18+
- MongoDB Atlas account
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone https://github.com/MaireadForge/codecollab.git
cd codecollab
```

2. Install backend dependencies
```bash
cd server
npm install
```

3. Set up backend environment variables
Create a `.env` file in the `/server` folder:
PORT=5000
MONGO_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_jwt_secret_key

4. Install frontend dependencies
```bash
cd ../client
npm install
```

5. Run the backend
```bash
cd server
npm run dev
```

6. Run the frontend
```bash
cd client
npm run dev
```

7. Open http://localhost:5173 in your browser

## 🔌 API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register new user |
| POST | /api/auth/login | Login and get JWT token |

### Rooms
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/rooms/create | Create a new room |
| POST | /api/rooms/join | Join existing room |
| GET | /api/rooms | Get user's rooms |
| GET | /api/rooms/:roomId | Get room details |
| PATCH | /api/rooms/:roomId/code | Update room code |
| PATCH | /api/rooms/:roomId/language | Update room language |
| GET | /api/rooms/:roomId/messages | Get chat history |

## 🔄 Real-Time Socket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| join-room | Client → Server | Join a coding room |
| room-users | Server → Client | Updated users list |
| code-change | Bidirectional | Sync code changes |
| language-change | Bidirectional | Sync language selection |
| cursor-change | Bidirectional | Sync cursor positions |
| send-message | Client → Server | Send chat message |
| receive-message | Server → Client | Receive chat message |
| chat-history | Server → Client | Load message history |
| leave-room | Client → Server | Leave a coding room |

## 🏗️ Architecture Highlights

- **Real-Time Sync** — Socket.IO rooms for isolated per-room broadcasting
- **Infinite Loop Prevention** — isLocalChange ref pattern prevents echo on code sync
- **Debounced Persistence** — Code saved to MongoDB 1 second after last keystroke
- **Late Joiner Sync** — New users receive current code state and chat history on join
- **In-Memory Presence** — Connected users tracked in server-side Map for O(1) operations
- **JWT Stateless Auth** — Token verified on every protected request via middleware



## 📄 License
MIT
