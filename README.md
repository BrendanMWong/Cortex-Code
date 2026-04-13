# Cortex Code

Cortex Code is an Electron-based local **AI agent** application that runs a React frontend with an Express backend and uses Ollama's `llama3` model for conversational AI. The AI agent can discuss a selected codebase, and make changes to its contents.

## How to run the installed `.exe` from GitHub release

If you have installed `Cortex.Code.v1.0.0.Initial.Release.exe` from the GitHub release, use these steps:

1. Install the app by running the downloaded installer.
2. Make sure Ollama is installed and the `llama3` model is available:
   - Download Ollama here: https://ollama.com/download
   - Run this in your terminal: `ollama pull llama3`
3. Launch the installed Cortex Code app:
   - Use the Windows Start menu entry, desktop shortcut, or the installed app launcher.
4. Use the app normally once it opens.

### Important note
- The installed `.exe` is based on the Electron build, so the app should launch directly from Windows.
- The app automatically starts `ollama serve` in the background when it launches.
- If Ollama is not installed or not on your PATH, the app will fail to start it.

### Stopping
- Close the Cortex Code app normally.
- The app shuts down the Ollama process automatically when it quits.

---

## Repository / source instructions without the installed `.exe` from GitHub release

### One-time setup

Clone the repo and install dependencies:

```bash
git clone https://github.com/BrendanMWong/Cortex-Code.git
cd Cortex-Code
npm install
cd frontend
npm install
cd ..
```

Install Ollama and pull the model:

```bash
ollama pull llama3
```

### Run the project and terminate it

Open three terminals:

- Terminal 1 for `ollama serve`
- Terminal 2 for `node server.js`
- Terminal 3 for `npm run dev`

Start Ollama:

```bash
ollama serve
```

Start the node server:

```bash
node server.js
```

Start the app locally:

```bash
npm run dev
```

Click the link `npm run dev` returns. It opens the project in a browser window.

When done:

- In the terminal running `npm run dev`: press `Ctrl + C`
- In the terminal running `node server.js`: press `Ctrl + C`
- In the terminal running `ollama serve`: press `Ctrl + C`

### Optional built version instead of `npm run dev`

```bash
npm run build --prefix frontend
npm run preview --prefix frontend
```

When finished:

- `Ctrl + C` to stop `node server.js` and `npm run preview`
- `Ctrl + C` to stop `ollama serve`

### Optional electron application version instead of `npm run dev`

```bash
npm run build 
npm run electron
```

When finished:

- Close the application window

### Optional .exe application version instead of `npm run dev`

```bash
npm run build 
npm run dist
```

1. Locate the .exe installer file: Cortex-Code/dist/Cortex Code Setup 1.0.0.exe
2. Run the installer
3. Launch the installed Cortex Code app:
   - Use the Windows Start menu entry, desktop shortcut, or the installed app launcher.


When finished:

- Close the application window
