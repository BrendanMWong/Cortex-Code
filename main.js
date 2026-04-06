const { app, BrowserWindow } = require("electron")
const path = require("path")
const { spawn } = require("child_process")

let mainWindow
let serverProcess
let ollamaProcess

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.loadFile(
    path.join(__dirname, "frontend/dist/index.html")
  )

  // Debug tools (optional but useful)
  mainWindow.webContents.openDevTools()
}

function startBackend() {
  // Start Express server
  serverProcess = spawn("node", ["server.js"], {
    cwd: __dirname,
    shell: true,
    stdio: "inherit"
  })

  serverProcess.on("error", (err) => {
    console.error("[server] failed to start:", err)
  })
}

function startOllama() {
  // Start Ollama server
  ollamaProcess = spawn("ollama", ["serve"], {
    shell: true,
    stdio: "inherit"
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