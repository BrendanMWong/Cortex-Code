import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './App.css'

function App() {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState([])
  const [edits, setEdits] = useState(null)
  const [rootPath, setRootPath] = useState("")
  const [rootStatus, setRootStatus] = useState(null) // NEW

  const chatEndRef = useRef(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function setRoot(path) {
    const res = await fetch("http://localhost:3001/set-root", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path })
    })

    return res
  }

  async function handleUpdateRoot() {
    try {
      const res = await setRoot(rootPath)

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Invalid path")
      }

      localStorage.setItem("rootPath", rootPath)
      setRootStatus({ type: "success", message: "Root updated successfully" })
    } catch (err) {
      setRootStatus({ type: "error", message: err.message })
    }
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
          <div className="panelHeader">Proposed Changes</div>

          {edits.map((e, i) => (
            <div key={i} className="editItem">
              <div className="editPath">{e.path}</div>
              <div className="editAction">{e.action}</div>
              <pre className="editContent">
                {(e.content || "").slice(0, 200)}
              </pre>
            </div>
          ))}

          <button className="applyBtn" onClick={applyEdits}>
            Apply Changes
          </button>
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
        <div className="panelHeader">Workspace Root</div>

        <input
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
          placeholder="Enter project root path..."
        />

        <button className="rootBtn" onClick={handleUpdateRoot}>
          Update Root
        </button>

        {/* NEW STATUS UI */}
        {rootStatus && (
          <div className={`rootStatus ${rootStatus.type}`}>
            {rootStatus.message}
          </div>
        )}
      </div>

    </div>
  )
}

export default App