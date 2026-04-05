import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [input, setInput] = useState("")
  const [output, setOutput] = useState("")
  const [status, setStatus] = useState("Initializing...")

  // NEW: root path state
  const [rootPath, setRootPath] = useState("")

  useEffect(() => {
    async function init() {
      try {
        // Try restoring previous root (optional but useful)
        const savedPath = localStorage.getItem("rootPath")
        if (savedPath) {
          setRootPath(savedPath)
          await setRoot(savedPath)
        }

        setStatus("Connected")
      } catch {
        setStatus("Backend not reachable")
      }
    }

    init()
  }, [])

  async function setRoot(path) {
    const res = await fetch("http://localhost:3001/set-root", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path })
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || "Failed to set root")
    }

    return true
  }

  // NEW: button handler
  async function handleUpdateRoot() {
    setStatus("Updating root...")

    try {
      await setRoot(rootPath)
      localStorage.setItem("rootPath", rootPath)
      setStatus("Root updated")
    } catch (e) {
      setStatus("Invalid root path")
    }
  }

  async function sendChat() {
    setOutput("Thinking...")

    try {
      const res = await fetch("http://localhost:3001/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input })
      })

      const data = await res.json()
      setOutput(data.reply || data.error || "No response")

    } catch {
      setOutput("Request failed")
    }
  }

  async function sendEdit() {
    setOutput("Editing...")

    try {
      const res = await fetch("http://localhost:3001/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input })
      })

      const data = await res.json()
      setOutput(JSON.stringify(data, null, 2))

    } catch {
      setOutput("Request failed")
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>AI Code Engine</h1>
      <p>Status: {status}</p>

      <textarea
        rows={4}
        style={{ width: "100%" }}
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />

      <div style={{ marginTop: 10 }}>
        <button onClick={sendChat}>Chat</button>
        <button onClick={sendEdit} style={{ marginLeft: 10 }}>
          Edit
        </button>
      </div>

      {/* NEW: Root Path Section */}
      <div style={{ marginTop: 30 }}>
        <h3>Workspace Root</h3>

        <input
          type="text"
          style={{ width: "100%" }}
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
          placeholder="Enter file path..."
        />

        <button onClick={handleUpdateRoot} style={{ marginTop: 10 }}>
          Update Root
        </button>
      </div>

      <pre style={{ marginTop: 20 }}>
        {output}
      </pre>
    </div>
  )
}

export default App