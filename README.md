# CodeCollab — AI-Powered Real-Time Collaborative Coding Platform

A full-stack real-time collaborative coding platform where multiple users can join rooms, write code together simultaneously, explore GitHub repositories, get AI-powered code analysis, chat, and see each other's cursors live.

## 🚀 Live Demo
[https://code-collab-swart-sigma.vercel.app/](https://code-collab-swart-sigma.vercel.app/)

## ✨ Features

- **Real-Time Code Collaboration** — Multiple users editing code simultaneously with live synchronization
- **Live Cursor Tracking** — See other users' cursors in real time with unique color indicators
- **Room System** — Create and join coding rooms via unique room codes or invite links
- **Multi-Language Support** — JavaScript, Python, C++, and Java with syntax highlighting
- **Code Execution** — Run JavaScript natively and Python/Java/C++ via AI simulation with custom stdin support
- **AI Coding Assistant** — Explain, debug, optimize, analyze complexity, and generate test cases using Groq LLM
- **GitHub Codebase Explorer** — Import any public GitHub repository, browse file tree collaboratively, and analyze files with AI
- **Live Chat** — Real-time chat alongside the editor with message history for late joiners
- **User Presence** — See who's currently in the room with colored indicators
- **Persistent State** — Code and language settings saved to database, late joiners see current state
- **Editor Customization** — Multiple themes (Dark, Light, High Contrast) and adjustable font size
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
- Groq SDK (llama-3.3-70b-versatile)
- GitHub REST API

### DevOps
- GitHub Actions (CI/CD)
- Render (Backend Deployment)
- Vercel (Frontend Deployment)

## 🏗️ Architecture Highlights

- **Real-Time Sync** — Socket.IO rooms for isolated per-room broadcasting
- **Infinite Loop Prevention** — isLocalChange ref pattern prevents echo on code sync
- **Debounced Persistence** — Code saved to MongoDB 1 second after last keystroke
- **Late Joiner Sync** — New users receive current code state and chat history on join
- **In-Memory Presence** — Connected users tracked in server-side Map for O(1) operations
- **JWT Stateless Auth** — Token verified on every protected request via middleware
- **GitHub File Tree** — Flat path array converted to nested recursive tree structure
- **Collaborative GitHub Mode** — File selection syncs across all room participants via Socket.IO
- **Read-Only Editor** — Monaco Editor switches to read-only when viewing GitHub files
- **AI Code Analysis** — Groq LLM with role-specific system prompts for different analysis types
- **Sandboxed JS Execution** — JavaScript runs in Node.js vm module with 5-second timeout
- **stdin Support** — Pre-defined input model for all languages, similar to competitive programming platforms

## 👩‍💻 Author
Anshita Shrivastava 
