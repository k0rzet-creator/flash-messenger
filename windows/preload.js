const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("flashApp", {
    isElectron: true,
    platform: process.platform,
    version: "1.0.0",

    minimize: () => ipcRenderer.send("window-minimize"),
    maximize: () => ipcRenderer.send("window-maximize"),
    close: () => ipcRenderer.send("window-close"),
    isMaximized: () => ipcRenderer.invoke("window-is-maximized"),

    goBack: () => ipcRenderer.send("nav-back"),
    goForward: () => ipcRenderer.send("nav-forward"),
    reload: () => ipcRenderer.send("nav-reload"),

    onNavUpdate: (callback) => {
        ipcRenderer.on("nav-update", (event, data) => callback(data));
    },

    // Уведомления
    showNotification: (data) => ipcRenderer.send("show-notification", data),
    
    // Слушатель клика по уведомлению
    onOpenChatNotification: (callback) => {
        ipcRenderer.on("open-chat-from-notification", (event, chatId) => callback(chatId));
    }
});
