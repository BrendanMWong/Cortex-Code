/**
 * =========================
 * Electron + Node Imports
 * =========================
 */

// Core Electron APIs for desktop window + app lifecycle
const { app, BrowserWindow, Menu } = require("electron")

// Path utilities for loading frontend build assets
const path = require("path")

// Used to spawn external processes (Ollama server)
const { spawn } = require("child_process")

// Local backend server lifecycle controls
const { startServer, stopServer } = require("./server")


/**
 * =========================
 * Electron Configuration
 * =========================
 */

// Disables GPU disk caching (stability / performance tweak)
app.commandLine.appendSwitch("disable-features", "GpuDiskCache")


/**
 * =========================
 * Runtime State
 * =========================
 */

// Main application window reference
let mainWindow

// External Ollama process reference (managed manually)
let ollamaProcess


/**
 * =========================
 * Window Creation
 * =========================
 */

/**
 * createWindow
 * Initializes the Electron BrowserWindow and loads the built frontend.
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,

    // Application window title
    title: "Cortex Code",

    // App icon (used in taskbar / window chrome)
    icon: path.join(__dirname, "frontend/dist/favicon.ico"),

    // UI cleanup: hide default Electron menu bar
    autoHideMenuBar: true,

    // Security-related WebPreferences
    webPreferences: {
      contextIsolation: true,   // isolates renderer from Node context
      nodeIntegration: false,   // prevents direct Node access in frontend
      devTools: false           // disables devtools in production build
    }
  })

  // Remove application menu entirely
  Menu.setApplicationMenu(null)
  mainWindow.removeMenu()
  mainWindow.setMenuBarVisibility(false)

  // Load compiled React frontend (Vite build output)
  mainWindow.loadFile(
    path.join(__dirname, "frontend/dist/index.html")
  )
}


/**
 * =========================
 * Backend Startup
 * =========================
 */

/**
 * Starts Express backend server on fixed port (3001).
 * Used by frontend to communicate with AI engine.
 */
async function startBackend() {
  try {
    await startServer(3001)
  } catch (err) {
    console.error("[server] failed to start:", err)
  }
}


/**
 * =========================
 * Ollama Process Management
 * =========================
 */

/**
 * startOllama
 * Spawns local Ollama runtime as a background process.
 *
 * This enables AI model access via http://localhost:11434
 */
function startOllama() {
  ollamaProcess = spawn("ollama", ["serve"], {
    shell: false,

    // Prevent console window from showing (Windows UX cleanup)
    stdio: "ignore",
    windowsHide: true
  })

  // Handle failure to spawn Ollama
  ollamaProcess.on("error", (err) => {
    console.error("[ollama] failed to start:", err)
  })
}


/**
 * =========================
 * App Lifecycle
 * =========================
 */

/**
 * App ready → start backend + Ollama + UI
 */
app.whenReady().then(async () => {
  await startBackend()
  startOllama()
  createWindow()
})


/**
 * Before quit → clean shutdown of backend + AI process
 */
app.on("before-quit", () => {
  // Stop Express server
  stopServer()

  // Stop Ollama process if running
  if (ollamaProcess) {
    console.log("[ollama] shutting down...")
    ollamaProcess.kill()
  }
})


/**
 * macOS behavior compatibility:
 * Quit fully when all windows are closed (non-mac platforms only)
 */
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})