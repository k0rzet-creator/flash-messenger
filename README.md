
<div align="center">

# FLASH MESSENGER

**Simple. Fast. Reliable.**

An open-source messenger with its own servers and clients.  
No ads. No tracking. Just you and your contacts.

<br>

[![License: MIT](https://img.shields.io/badge/License-MIT-ff2d6f?style=for-the-badge)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-ff2d6f?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Electron](https://img.shields.io/badge/Electron-32+-ff2d6f?style=for-the-badge&logo=electron&logoColor=white)](https://electronjs.org)
[![Version](https://img.shields.io/badge/Version-1.0.0-ff2d6f?style=for-the-badge)](../../releases)

</div>

---

## About the project

**Flash Messenger** is a fully open-source messenger that solves the main problem of modern platforms: the lack of privacy and full control over your data.

There are no corporations reading your messages. No algorithms tracking your interests. Just code, a server, and you.

> **We don't store your data. We don't sell your data. We don't know who you are.**

---

## Features

<table>
<tr>
<td width="50%">

### Security
- **AES-256-GCM** encryption
- Server connection password
- JWT authorization
- No telemetry

</td>
<td width="50%">

### Freedom
- Your own servers
- Your own clients
- Open source
- Full control over data

</td>
</tr>
<tr>
<td width="50%">

### Architecture
- Real-time delivery
- Minimal dependencies
- Lightweight project structure
- Local data storage

</td>
<td width="50%">

### Cross-platform
- Windows client
- Android (in development)
- Linux (planned)
- macOS (planned)

</td>
</tr>
</table>

---

## Project structure

```text
flash-messenger/
├── server/                # Server
│   ├── server.js
│   ├── server.json.example
│   └── package.json
│
├── client-windows/        # Windows client
│   ├── main.js
│   ├── preload.js
│   ├── titlebar.html
│   ├── titlebar.css
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── package.json
│
└── site/                  # Landing page & web version
    ├── index.html
    ├── download.html
    ├── web.html           # Web version
    ├── style.css
    └── app.js
```

---

## Deploy the server

Choose your operating system.

<details>
<summary><b>Windows</b></summary>

<br>

**1. Install Node.js**
Download the LTS version from [nodejs.org](https://nodejs.org) and install it (check "Add to PATH").

**2. Set up the config**
```cmd
cd server
copy server.json.example server.json
```
Open `server.json` and fill in `password`, `jwt_secret`, `connect_secret`.

**3. Install dependencies and start**
```cmd
npm install
npm start
```

The server will be available at `http://localhost:8080`.

</details>

<details>
<summary><b>Linux</b></summary>

<br>

**1. Install Node.js**
```bash
# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Arch
sudo pacman -S nodejs npm
```

**2. Set up the config**
```bash
cd server
cp server.json.example server.json
nano server.json
```
Fill in `password`, `jwt_secret`, `connect_secret`.

**3. Install dependencies and start**
```bash
npm install
npm start
```

The server will be available at `http://localhost:8080`.

</details>

<details>
<summary><b>macOS</b></summary>

<br>

**1. Install Node.js**
```bash
# Via Homebrew
brew install node

# Or download the installer from nodejs.org
```

**2. Set up the config**
```bash
cd server
cp server.json.example server.json
open -e server.json
```
Fill in `password`, `jwt_secret`, `connect_secret`.

**3. Install dependencies and start**
```bash
npm install
npm start
```

The server will be available at `http://localhost:8080`.

</details>

---

## Windows client

Download the installer or portable version from **[Releases](../../releases)** or from the official site: **[flash-msg.netlify.app](https://flash-msg.netlify.app/download.html)**.

---

## Roadmap

- [x] Node.js server
- [x] AES-256-GCM encryption
- [x] Electron Windows client
- [x] Multi-server system (own server, own password)
- [ ] User badges and icons
- [ ] Group chats and channels
- [ ] Encrypted file sharing
- [ ] Android client (Capacitor)
- [ ] Voice and video calls (WebRTC)
- [ ] Linux client
- [ ] macOS client
- [ ] E2E encryption (Signal Protocol)

---

## Links

- **Website:** [flash-msg.netlify.app](https://flash-msg.netlify.app)
- **Telegram channel:** [@flash_messenger](https://t.me/flash_messenger)
- **MAX channel:** [Flash on MAX](https://max.ru/join/T8YfRJgPCKY9o7ILqLc5El5aNjlMGJFTJDP15teU89Y)

---

## License

This project is distributed under the **MIT** license.  
See [LICENSE](./LICENSE) for details.

<div align="center">

<br>

**Made by a 14-year-old with no budget and a bit of DeepSeek. Sorry for the AI slop.**

</div>
