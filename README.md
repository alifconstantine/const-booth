# ConstBooth 📸

**ConstBooth** is a modern, ad-free online photobooth and nostalgic keepsakes platform built with Next.js and TypeScript.

## ✨ Features

1. **Photobooth (`/booth`, `/camera`)**
   - **Solo Booth**: Capture retro film-style photo strips with countdown, customizable color frames, filters, and stickers.
   - **Shared Booth**: Real-time dual-camera photobooth for long-distance friends and couples using WebRTC and custom WebSocket signaling.
2. **Digital Cassette (`/studio/cassette`)**
   - Pick a retro tape design, customize the label with photo and date, record a voice message, and share a playable interactive cassette tape.
3. **Handwritten Letters (`/studio/letters`)**
   - Craft digital handwritten letters with authentic paper textures, ink colors, handwriting fonts (*Caveat*, *Kalam*, *Dancing Script*, *Patrick Hand*), stickers, and envelope sealing animation. Export as PNG or high-res PDF.

## 🚀 Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript & Vanilla JS Canvas/Audio Engines
- **Real-Time Signaling**: Node.js HTTP + WebSocket Server (`ws`)
- **WebRTC**: Peer-to-peer audio/video streaming for Shared Booth
- **Styling**: Responsive Design System with zero external ad networks

## 🛠️ Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/alifconstantine/const-booth.git
cd const-booth

# Install dependencies
npm install

# Build for production
npm run build

# Start server (with WebSockets signaling on /api/ws)
npm start
```

Open [http://localhost:3000](http://localhost:3000) to view ConstBooth.

## 📄 License

MIT
