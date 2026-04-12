const { app, BrowserWindow, Menu } = require("electron")
const path = require("path")
const { spawn } = require("child_process")

let mainWindow
let serverProcess
let ollamaProcess

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false
    }
  })

  mainWindow.removeMenu()
  mainWindow.setMenuBarVisibility(false)

  mainWindow.loadFile(
    path.join(__dirname, "frontend/dist/index.html")
  )
}

function startBackend() {
  // Start Express server with hidden console windows on Windows
  serverProcess = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    cwd: __dirname,
    shell: false,
    stdio: "ignore",
    windowsHide: true
  })

  serverProcess.on("error", (err) => {
    console.error("[server] failed to start:", err)
  })
}

function startOllama() {
  // Start Ollama server with hidden console windows on Windows
  ollamaProcess = spawn("ollama", ["serve"], {
    shell: true,
    stdio: "ignore",
    windowsHide: true
  })

  ollamaProcess.on("error", (err) => {
    console.error("[ollama] failed to start:", err)
  })
}

app.whenReady().then(() => {
  startBackend()
  startOllama()
  createWindow()
})

app.on("before-quit", () => {
  if (serverProcess) {
    console.log("[server] shutting down...")
    serverProcess.kill()
  }

  if (ollamaProcess) {
    console.log("[ollama] shutting down...")
    ollamaProcess.kill()
  }
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})