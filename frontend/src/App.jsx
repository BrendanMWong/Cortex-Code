import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './App.css'

function App() {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState([])
  const [edits, setEdits] = useState(null)
  const [rootPath, setRootPath] = useState("")

  const chatEndRef = useRef(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

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
    if (!input.trim()) return

    setEdits(null)

    const userMessage = { role: "user", content: input }
    setMessages(prev => [...prev, userMessage])

    const res = await fetch("http://localhost:3001/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input })
    })

    const data = await res.json()

    const aiMessage = {
      role: "assistant",
      content: data.reply || data.error
    }

    setMessages(prev => [...prev, aiMessage])
    setInput("")
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
    }
  }

  async function applyEdits() {
    await fetch("http://localhost:3001/apply-edits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edits })
    })

    setEdits(null)
    setMessages(prev => [...prev, {
      role: "assistant",
      content: "✅ Changes applied"
    }])
  }

  return (
    <div className="appContainer">

      {/* CHAT STREAM */}
      <div className="chatStream">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={msg.role === "user" ? "userBubble" : "assistantMessage"}
          >
            {msg.role === "assistant" ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {msg.content}
              </ReactMarkdown>
            ) : (
              msg.content
            )}
          </div>
        ))}

        <div ref={chatEndRef} />
      </div>

      {/* EDIT PREVIEW */}
      {edits && (
        <div className="editPanel">
          <h3>Proposed Changes</h3>

          {edits.map((e, i) => (
            <div key={i} className="editItem">
              <b>{e.path}</b> — {e.action}
              <pre>{(e.content || "").slice(0, 200)}</pre>
            </div>
          ))}

          <button onClick={applyEdits}>Apply Changes</button>
        </div>
      )}

      {/* INPUT BAR */}
      <div className="inputBar">
        <textarea
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
        />

        <div className="actions">
          <button className="chatBtn" onClick={sendChat}>Chat</button>
          <button className="editBtn" onClick={sendEdit}>Edit</button>
        </div>
      </div>

      {/* WORKSPACE ROOT */}
      <div className="rootSection">
        <h3>Workspace Root</h3>

        <input
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
        />

        <button onClick={handleUpdateRoot}>
          Update Root
        </button>
      </div>

    </div>
  )
}

export default App