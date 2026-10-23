// ============================================
// ПЕРЕМЕННЫЕ
// ============================================
let history = {
    canGoBack: false,
    canGoForward: false,
};

function updateNavButtons() {
    const btnBack = document.getElementById("btn-back");
    const btnForward = document.getElementById("btn-forward");
    if (btnBack) btnBack.disabled = !history.canGoBack;
    if (btnForward) btnForward.disabled = !history.canGoForward;
}

function updateMaximizeIcon(isMaximized) {
    const iconMax = document.querySelector(".icon-max");
    const iconRestore = document.querySelector(".icon-restore");
    if (isMaximized) {
        iconMax.style.display = "none";
        iconRestore.style.display = "block";
    } else {
        iconMax.style.display = "block";
        iconRestore.style.display = "none";
    }
}

// ============================================
// КНОПКИ НАВИГАЦИИ — отправляем команды в main.js
// ============================================
document.getElementById("btn-back").addEventListener("click", () => {
    if (window.flashApp) window.flashApp.goBack();
});

document.getElementById("btn-forward").addEventListener("click", () => {
    if (window.flashApp) window.flashApp.goForward();
});

document.getElementById("btn-reload").addEventListener("click", () => {
    if (window.flashApp) window.flashApp.reload();
});

// ============================================
// КНОПКИ ОКНА
// ============================================
document.getElementById("btn-minimize").addEventListener("click", () => {
    if (window.flashApp) window.flashApp.minimize();
});

document.getElementById("btn-maximize").addEventListener("click", async () => {
    if (window.flashApp) {
        window.flashApp.maximize();
        setTimeout(async () => {
            const isMax = await window.flashApp.isMaximized();
            updateMaximizeIcon(isMax);
        }, 100);
    }
});

document.getElementById("btn-close").addEventListener("click", () => {
    if (window.flashApp) window.flashApp.close();
});

// ============================================
// СЛУШАЕМ СОБЫТИЯ ОТ MAIN.JS
// ============================================
if (window.flashApp && window.flashApp.onNavUpdate) {
    window.flashApp.onNavUpdate((data) => {
        history.canGoBack = data.canGoBack;
        history.canGoForward = data.canGoForward;
        updateNavButtons();
    });
}