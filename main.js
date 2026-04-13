const { app, BrowserWindow, Menu } = require("electron")
const path = require("path")
const { spawn } = require("child_process")
const { startServer, stopServer } = require("./server")

app.commandLine.appendSwitch("disable-features", "GpuDiskCache")

let mainWindow
let ollamaProcess

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Cortex Code",
    icon: path.join(__dirname, "frontend/dist/favicon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false
    }
  })

  Menu.setApplicationMenu(null)
  mainWindow.removeMenu()
  mainWindow.setMenuBarVisibility(false)

  mainWindow.loadFile(
    path.join(__dirname, "frontend/dist/index.html")
  )
}

async function startBackend() {
  try {
    await startServer(3001)
  } catch (err) {
    console.error("[server] failed to start:", err)
  }
}

function startOllama() {
  // Start Ollama server with hidden console windows on Windows
  ollamaProcess = spawn("ollama", ["serve"], {
    shell: false,
    stdio: "ignore",
    windowsHide: true
  })

  ollamaProcess.on("error", (err) => {
    console.error("[ollama] failed to start:", err)
  })
}

app.whenReady().then(async () => {
  await startBackend()
  startOllama()
  createWindow()
})

app.on("before-quit", () => {
  stopServer()

  if (ollamaProcess) {
    console.log("[ollama] shutting down...")
    ollamaProcess.kill()
  }
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})