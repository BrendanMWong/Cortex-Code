import { useState } from 'react'
import './App.css'

function App() {
  const [input, setInput] = useState("")
  const [output, setOutput] = useState("")
  const [edits, setEdits] = useState(null)

  const [rootPath, setRootPath] = useState("")

  async function setRoot(path) {
    await fetch("http://localhost:3001/set-root", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path })
    })
  }

  async function handleUpdateRoot() {
    await setRoot(rootPath)
    localStorage.setItem("rootPath", rootPath)
  }

  async function sendChat() {
    setEdits(null)

    const res = await fetch("http://localhost:3001/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input })
    })

    const data = await res.json()
    setOutput(data.reply || data.error)
  }

  async function sendEdit() {
    const res = await fetch("http://localhost:3001/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input })
    })

    const data = await res.json()

    if (data.edits) {
      setEdits(data.edits)
      setOutput("Review changes below")
    } else {
      setOutput(data.error)
    }
  }

  async function applyEdits() {
    await fetch("http://localhost:3001/apply-edits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edits })
    })

    setEdits(null)
    setOutput("✅ Changes applied")
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>AI Code Engine</h1>

      <textarea
        rows={4}
        style={{ width: "100%" }}
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />

      <div style={{ marginTop: 10 }}>
        <button onClick={sendChat}>Chat</button>
        <button onClick={sendEdit}>Edit</button>
      </div>

      {/* EDIT PREVIEW */}
      {edits && (
        <div style={{ marginTop: 20 }}>
          <h3>Proposed Changes</h3>

          {edits.map((e, i) => (
            <div key={i} style={{ border: "1px solid #ccc", margin: 10, padding: 10 }}>
              <b>{e.path}</b> — {e.action}
              <pre>{(e.content || "").slice(0, 200)}</pre>
            </div>
          ))}

          <button onClick={applyEdits}>Apply Changes</button>
        </div>
      )}

      <pre style={{ marginTop: 20 }}>
        {output}
      </pre>

      {/* ROOT */}
      <div style={{ marginTop: 30 }}>
        <h3>Workspace Root</h3>

        <input
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
          style={{ width: "100%" }}
        />

        <button onClick={handleUpdateRoot}>
          Update Root
        </button>
      </div>
    </div>
  )
}

export default App