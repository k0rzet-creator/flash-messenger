
<div align="center">

# FLASH MESSENGER

**Simple. Fast. Reliable.**

An open-source messenger with its own servers and clients.  
No ads. No tracking. Just you and your contacts.

<br>

[![License: MIT](https://img.shields.io/badge/License-MIT-ff2d6f?style=for-the-badge)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-ff2d6f?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Electron](https://img.shields.io/badge/Electron-32+-ff2d6f?style=for-the-badge&logo=electron&logoColor=white)](https://electronjs.org)
[![Version](https://img.shields.io/badge/Version-1.0.0--beta-ff2d6f?style=for-the-badge)](../../releases)

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
- Real-time delivery (WebSocket)
- Minimal dependencies
- Lightweight project structure
- Local data storage (SQLite)

</td>
<td width="50%">

### Cross-platform
- Windows client (Electron)
- Web version (PWA)
- Android (RuStore Beta)
- Linux / macOS (planned)

</td>
</tr>
</table>

---

## Project structure

```text
flash-messenger/
├── server/                  # Server (Node.js)
│   ├── server.js
│   ├── server.json          # config (password, secrets, port)
│   ├── start.bat            # Windows launcher
│   ├── data/                # SQLite database
│   └── public/              # Static files (web client, landing)
│       ├── index.html       # Landing page
│       ├── download.html    # Download page
│       ├── web.html         # Web client
│       ├── app.js
│       ├── style.css
│       └── ...              # icons, manifest, sw.js
│
├── windows/                 # Windows client (Electron)
│   ├── main.js
│   ├── preload.js
│   ├── titlebar.html
│   ├── titlebar.css
│   ├── titlebar.js
│   ├── index.html           # Copy of web.html
│   ├── app.js               # Copy of app.js
│   ├── style.css            # Copy of style.css
│   ├── icon.ico
│   └── package.json
│
├── android/                 # Android build (Capacitor/Gradle)
│   ├── app/                 # Native Android project
│   ├── gradle-8.5/
│   ├── jdk/
│   ├── android-sdk/
│   ├── BUILD_APK_RELEASE.py # Python build script
│   └── icon.png
│
└── README.md
```

---

## Deploy the server

Choose your operating system.

<details>
<summary><b>Windows</b></summary>

<br>

**1. Install Node.js**
Download the LTS version from [nodejs.org](https://nodejs.org) and install it (check "Add to PATH").

**2. Configure**
```cmd
cd server
```
Open `server.json` and fill in `password`, `jwt_secret`, `connect_secret`.

**3. Install & run**
```cmd
npm install
start.bat
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

**2. Configure**
```bash
cd server
nano server.json
```
Fill in `password`, `jwt_secret`, `connect_secret`.

**3. Install & run**
```bash
npm install
node server.js
```

</details>

<details>
<summary><b>macOS</b></summary>

<br>

**1. Install Node.js**
```bash
brew install node
```

**2. Configure**
```bash
cd server
open -e server.json
```

**3. Install & run**
```bash
npm install
node server.js
```

</details>

---

## Public server

The official Flash server is running at:

- **Web client:** [https://flash-msg.site/app](https://flash-msg.site/app)
- **Landing page:** [https://flash-msg.site](https://flash-msg.site)

---

## Windows client

Download the installer or portable version from **[Releases](../../releases)** or from the official site.

---

## Android client

Download the `.apk` from **[Releases](../../releases)** or install from **RuStore** (search "Flash").

---

## Roadmap

- [x] Node.js server
- [x] AES-256-GCM encryption
- [x] Electron Windows client
- [x] Multi-server system (own server, own password)
- [x] Read receipts & replies
- [x] Online status
- [x] Desktop notifications (Windows)
- [x] Web version (PWA)
- [x] Android APK (beta, RuStore)
- [ ] User badges and icons
- [ ] Group chats and channels
- [ ] Encrypted file sharing
- [ ] Voice and video calls (WebRTC)
- [ ] Linux client
- [ ] macOS client
- [ ] E2E encryption (Signal Protocol)

---

## Links

- **Website:** [flash-msg.site](https://flash-msg.site)
- **Telegram channel:** [@flash_messenger](https://t.me/flash_messenger)
- **MAX channel:** [Flash on MAX](https://max.ru/join/T8YfRJgPCKY9o7ILqLc5El5aNjlMGJFTJDP15teU89Y)
- **Developer:** [@k0rz3t](https://t.me/k0rz3t)

---

## License

This project is distributed under the **MIT** license.  
See [LICENSE](./LICENSE) for details.

<div align="center">

<br>

**Made by a 14-year-old with no budget and a bit of DeepSeek. Sorry for the AI slop.**

</div>
