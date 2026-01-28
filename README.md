# ♟️ ChessXChess

**Collaborative Chess** - A real-time multiplayer chess game where players take turns in a queue system.

![ChessXChess](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=flat-square&logo=tailwind-css)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

## ✨ Features

- 🎮 **Real-time Multiplayer** - Play chess with anyone in the world
- 👥 **Queue System** - Fair turn-based system where players queue for each color
- 🎵 **Jazz Music Player** - Ambient background music with 6 jazz tracks
- 🎨 **WebGL Shader Background** - Beautiful animated wave effects
- 📱 **Responsive Design** - Works on desktop and mobile
- ⚡ **Server-Sent Events** - Real-time game state synchronization
- 💾 **Persistent Preferences** - Volume and track preferences saved locally

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm, yarn, pnpm, or bun

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/chessxchess.git
cd chessxchess

# Install dependencies
npm install
# or
yarn install
# or
pnpm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to play!

## 🌐 Deploy to Vercel

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/chessxchess)

### Manual Deploy

1. **Create Vercel Account**
   - Go to [vercel.com](https://vercel.com) and sign up

2. **Connect Repository**
   - Click "Add New" → "Project"
   - Import your GitHub repository

3. **Configure (Optional)**
   - Framework Preset: Next.js (auto-detected)
   - Build Command: `npm run build`
   - Output Directory: `.next`

4. **Deploy**
   - Click "Deploy" and wait for build to complete
   - Your app will be live at `your-project.vercel.app`

### Environment Variables

No environment variables are required for basic deployment. The app uses:
- In-memory game state (resets on redeploy)
- Local storage for user preferences
- No external database required

## 🎮 How to Play

1. **Enter your name** to join the game
2. **Choose a color** (White or Black) to queue
3. **Wait for your turn** - You'll see your position in the queue
4. **Make your move** when it's your turn
5. **After your move**, you go to the back of the queue

### Game Rules

- Standard chess rules apply
- Players take turns in queue order
- Each player makes one move per turn
- Game resets when checkmate/stalemate occurs

## 🏗️ Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── game/route.ts    # Game actions API
│   │   └── stream/route.ts  # SSE real-time updates
│   ├── layout.tsx           # Root layout with metadata
│   ├── page.tsx             # Main game page
│   └── globals.css          # Global styles
├── components/
│   ├── ChessBoard.tsx       # Chess board component
│   ├── GameStatus.tsx       # Game status display
│   ├── MoveHistory.tsx      # Move history panel
│   ├── MusicPlayer.tsx      # Jazz music player
│   ├── PromotionModal.tsx   # Pawn promotion modal
│   ├── QueuePanel.tsx       # Player queue panel
│   └── ShaderBackground.tsx # WebGL shader background
├── hooks/
│   └── useGame.ts           # Game state hook
└── lib/
    └── gameStore.ts         # Server-side game store
```

## 🛠️ Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Chess Logic**: [chess.js](https://github.com/jhlywa/chess.js)
- **Real-time**: Server-Sent Events (SSE)
- **Graphics**: WebGL shaders

## 📝 Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

## ⚠️ Known Limitations

1. **Serverless State**: Game state is stored in memory. On Vercel's serverless architecture:
   - State persists within a single instance
   - Cold starts may reset game state
   - For production use, consider adding a database (Redis, PostgreSQL, etc.)

2. **No Authentication**: Players are identified by local storage ID
   - Anyone can join any queue
   - No accounts or persistent history

## 🔧 Customization

### Adding Music

Add MP3 files to `public/audio/` and update the `TRACKS` array in `src/components/MusicPlayer.tsx`.

### Changing Colors

Edit the chess theme in `tailwind.config.ts` under `theme.extend.colors.chess`.

### Shader Effects

Modify `src/components/ShaderBackground.tsx` to change the background animation.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [chess.js](https://github.com/jhlywa/chess.js) for chess logic
- Chess piece symbols from Unicode
- Jazz music tracks included in `public/audio/`

---

**Made with ♟️ and ☕**
