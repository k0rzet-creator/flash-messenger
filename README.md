<div align="center">

# FLASH MESSENGER

**Simple. Fast. Reliable.**

An open-source messenger with its own servers and clients.  
No ads. No tracking. Just you and your contacts.

<br>

[![License: MPL 2.0](https://img.shields.io/badge/License-MPL%202.0-brightgreen.svg?style=for-the-badge)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-ff2d6f?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Electron](https://img.shields.io/badge/Electron-32+-ff2d6f?style=for-the-badge&logo=electron&logoColor=white)](https://electronjs.org)
[![Version](https://img.shields.io/badge/Version-1.1.0--beta-ff2d6f?style=for-the-badge)](../../releases)

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
- SQLite local storage
- **Push-notifications** (Firebase FCM)

</td>
<td width="50%">

### Cross-platform
- Windows client (Electron)
- Web version (PWA)
- Android (Capacitor)
- **Stickers & Sticker Packs**
- **Files & Media Gallery**

</td>
</tr>
</table>

---

## Project structure

```text
flash-messenger/
├── server/                  # Server (Node.js)
│   ├── server.js
│   ├── server.json.example  # Config template
│   └── public/              # Static files (web client, landing)
│       ├── index.html
│       ├── download.html
│       ├── web.html
│       ├── app.js
│       └── ...
│
├── windows/                 # Windows client (Electron)
│   ├── main.js
│   ├── preload.js
│   ├── titlebar.html
│   └── ...
│
├── android/                 # Android client (Capacitor)
│   ├── package.json
│   ├── capacitor.config.json
│   └── android/             # Native Android project
│
└── README.md
```

Deploy the server
<details> <summary><b>Windows</b></summary>

1. Install Node.js
Download the LTS version from nodejs.org.

2. Configure
cmd

cd server

Rename server.json.example to server.json and fill in password, jwt_secret, connect_secret.

3. Install & run
cmd

npm install
node server.js

</details><details> <summary><b>Linux / macOS</b></summary>

1. Install Node.js
bash

# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# macOS
brew install node

2. Configure
bash

cd server
cp server.json.example server.json
nano server.json # or open -e server.json on macOS

3. Install & run
bash

npm install
node server.js

</details>
Public server

The official Flash server is running at:

    Web client: https://flash-msg.site/web.html

    Landing page: https://flash-msg.site

Windows & Android Clients

Download the latest .exe (Windows) or .apk (Android) from Releases or from the official website.
Roadmap

    ☑

    Node.js server
    ☑

    AES-256-GCM encryption
    ☑

    Electron Windows client
    ☑

    Multi-server system
    ☑

    Read receipts & replies
    ☑

    Desktop & Mobile notifications
    ☑

    Web version (PWA)
    ☑

    Android APK (Capacitor)
    ☑

    Stickers & Sticker Packs
    ☑

    Files, Media & Gallery Viewer
    □

    Group chats and channels
    □

    Voice and video calls (WebRTC)
    □

    Linux / macOS clients
    □

    E2EE (Signal Protocol)

Links

    Website: flash-msg.site

    Telegram channel: @flash_messenger

    MAX channel: Flash on MAX

    Developer: @k0rz3t

License

This project is distributed under the Mozilla Public License 2.0 (MPL-2.0).
See LICENSE for details.
<div align="center">

Made by a 14-year-old with no budget and a bit of DeepSeek. Sorry for the AI slop.
</div>
