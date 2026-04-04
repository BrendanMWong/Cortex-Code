import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [input, setInput] = useState("")
  const [output, setOutput] = useState("")
  const [status, setStatus] = useState("Initializing...")

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("http://localhost:3001/set-root", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: "C:\\insert\\path\\here"
          })
        })

        if (!res.ok) throw new Error()

        setStatus("Connected")
      } catch {
        setStatus("Backend not reachable")
      }
    }

    init()
  }, [])

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

      <pre style={{ marginTop: 20 }}>
        {output}
      </pre>
    </div>
  )
}

export default App