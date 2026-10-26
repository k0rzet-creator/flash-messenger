const { app, BrowserWindow, BrowserView, Tray, Menu, shell, ipcMain, session, Notification } = require("electron");
const path = require("path");
const fs = require("fs");

const CONFIG_PATH = path.join(__dirname, "client.json");

let CONFIG = {
    window_width: 1200,
    window_height: 800,
    min_width: 900,
    min_height: 600,
    titlebar_height: 36,
};

if (fs.existsSync(CONFIG_PATH)) {
    try {
        CONFIG = { ...CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) };
    } catch (e) {
        console.error("config load error:", e);
    }
}

let mainWindow = null;
let appView = null;
let tray = null;
let isQuitting = false;

function updateViewBounds() {
    if (!mainWindow || !appView) return;
    const bounds = mainWindow.getContentBounds();
    appView.setBounds({
        x: 0,
        y: CONFIG.titlebar_height,
        width: bounds.width,
        height: bounds.height - CONFIG.titlebar_height,
    });
}

function sendNavUpdate() {
    if (!mainWindow || !appView) return;
    try {
        const nav = appView.webContents.navigationHistory;
        mainWindow.webContents.send("nav-update", {
            canGoBack: nav.canGoBack(),
            canGoForward: nav.canGoForward(),
        });
    } catch (e) {}
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: CONFIG.window_width,
        height: CONFIG.window_height,
        minWidth: CONFIG.min_width,
        minHeight: CONFIG.min_height,
        frame: false,
        backgroundColor: "#0f0f12",
        icon: path.join(__dirname, "icon.ico"),
        show: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadFile("titlebar.html");
    Menu.setApplicationMenu(null);

    appView = new BrowserView({
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            partition: "persist:flash",
            preload: path.join(__dirname, "preload.js"),
        },
    });

    mainWindow.setBrowserView(appView);
    updateViewBounds();

    appView.webContents.session.clearCache().then(() => {
        appView.webContents.loadURL("https://flash-msg.site/web.html");
    });

    appView.webContents.on("did-navigate", sendNavUpdate);
    appView.webContents.on("did-navigate-in-page", sendNavUpdate);

    appView.webContents.on("did-fail-load", (e, code, desc, url) => {
        console.error("VIEW FAILED:", code, desc, url);
    });

    appView.webContents.on("did-finish-load", () => {
        console.log("VIEW LOADED:", appView.webContents.getURL());
    });

    appView.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
    });

    mainWindow.on("resize", updateViewBounds);
    mainWindow.on("maximize", updateViewBounds);
    mainWindow.on("unmaximize", updateViewBounds);

    mainWindow.once("ready-to-show", () => {
        mainWindow.show();
    });

    mainWindow.on("close", (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
        appView = null;
    });
}

function createTray() {
    try {
        const iconPath = path.join(__dirname, "icon.ico");
        if (!fs.existsSync(iconPath)) return;

        tray = new Tray(iconPath);
        const menu = Menu.buildFromTemplate([
            {
                label: "Показать Flash",
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.focus();
                    } else {
                        createWindow();
                    }
                },
            },
            { type: "separator" },
            {
                label: "Выйти",
                click: () => {
                    isQuitting = true;
                    app.quit();
                },
            },
        ]);
        tray.setToolTip("Flash — мессенджер");
        tray.setContextMenu(menu);
        tray.on("click", () => {
            if (mainWindow) {
                if (mainWindow.isVisible()) {
                    mainWindow.hide();
                } else {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        });
    } catch (e) {
        console.warn("Tray error:", e);
    }
}

// IPC — кнопки окна
ipcMain.on("window-minimize", () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on("window-maximize", () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
    }
});
ipcMain.on("window-close", () => { if (mainWindow) mainWindow.close(); });
ipcMain.handle("window-is-maximized", () => mainWindow ? mainWindow.isMaximized() : false);

// IPC — навигация
ipcMain.on("nav-back", () => {
    if (appView) {
        const nav = appView.webContents.navigationHistory;
        if (nav.canGoBack()) nav.goBack();
    }
});
ipcMain.on("nav-forward", () => {
    if (appView) {
        const nav = appView.webContents.navigationHistory;
        if (nav.canGoForward()) nav.goForward();
    }
});
ipcMain.on("nav-reload", () => {
    if (appView) appView.webContents.session.clearCache().then(() => appView.webContents.reloadIgnoringCache());
});

// IPC — УВЕДОМЛЕНИЯ
ipcMain.on("show-notification", (event, data) => {
    console.log("Пришло уведомление:", data); // Проверка в консоли
    
    if (Notification.isSupported()) {
        const notif = new Notification({
            title: data.title || "Flash",
            body: data.body || "Новое сообщение",
            icon: path.join(__dirname, "icon.ico")
        });

        notif.on("click", () => {
            if (mainWindow) {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.show();
                mainWindow.focus();
                appView.webContents.send("open-chat-from-notification", data.chat_id);
            }
        });

        notif.show();
    } else {
        console.log("Уведомления не поддерживаются системой!");
    }
});

app.whenReady().then(() => {
    // ВАЖНО: чтобы Windows показывала уведомления от твоего приложения
    app.setAppUserModelId("com.k0rzet.flash");

    session.defaultSession.clearCache().catch(() => {});
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        details.requestHeaders["Cache-Control"] = "no-cache, no-store, must-revalidate";
        details.requestHeaders["Pragma"] = "no-cache";
        callback({ requestHeaders: details.requestHeaders });
    });

    createWindow();
    createTray();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("before-quit", () => { isQuitting = true; });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
