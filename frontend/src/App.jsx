import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './App.css'

const API_URL = "http://localhost:3001"

/* =========================
   Reusable UI Components
========================= */

function CopyButton({ text, index, copiedIndex, onCopy, label }) {
  return (
    <div className="copyWrapper">
      <button className="copyBtn" onClick={() => onCopy(text, index)}>
        <svg width="16" height="16" viewBox="0 0 24 24">
          <rect x="9" y="9" width="10" height="10" rx="2" opacity="0.55" />
          <rect x="5" y="5" width="10" height="10" rx="2" opacity="0.3" />
        </svg>
      </button>

      <div className="copyTooltip">
        {copiedIndex === index ? "Copied" : label}
      </div>
    </div>
  )
}

/* =========================
   Main App
========================= */

function App() {
  /* -------- State -------- */
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState([])
  const [edits, setEdits] = useState(null)

  const [rootPath, setRootPath] = useState("")
  const [rootStatus, setRootStatus] = useState(null)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const [copiedIndex, setCopiedIndex] = useState(null)
  const [showHelp, setShowHelp] = useState(false)

  const chatEndRef = useRef(null)

  /* -------- Effects -------- */

  // auto scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

  // load saved root from localStorage
  useEffect(() => {
    const savedRoot = localStorage.getItem("rootPath")
    if (savedRoot) {
      setRootPath(savedRoot)
    }
  }, [])

  // optionally auto-apply saved root to backend
  useEffect(() => {
    const savedRoot = localStorage.getItem("rootPath")
    if (savedRoot) {
      fetch(`${API_URL}/set-root`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: savedRoot })
      }).catch(() => {})
    }
  }, [])

  /* =========================
     API Helpers
  ========================= */

  async function post(endpoint, body) {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    })

    return res
  }

  async function postJSON(endpoint, body) {
    const res = await post(endpoint, body)
    return res.json()
  }

  /* =========================
     Chat Logic
  ========================= */

  async function sendChat() {
    if (!input.trim()) return

    setError(null)
    setEdits(null)

    const userMessage = { role: "user", content: input }
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    try {
      const data = await postJSON("/chat", { message: input })

      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || data.error || "No response"
        }
      ])
    } catch {
      setError("AI failed to respond")
    }

    setInput("")
    setIsLoading(false)
  }

  /* =========================
     Edit Logic
  ========================= */

  async function sendEdit() {
    setError(null)

    try {
      const data = await postJSON("/edit", { message: input })

      if (data.error) {
        setError(data.error)
        return
      }

      if (data.explanation) {
        setMessages(prev => [
          ...prev,
          { role: "assistant", content: data.explanation }
        ])
      }

      if (data.edits) {
        setEdits(data.edits)
      } else {
        setError("No edits returned")
      }

    } catch {
      setError("Edit request failed")
    }
  }

  async function applyEdits() {
    await post("/apply-edits", { edits })

    setEdits(null)

    setMessages(prev => [
      ...prev,
      { role: "assistant", content: "✅ Changes applied" }
    ])
  }

  async function rejectEdits() {
    await post("/reject-edits")

    setEdits(null)

    setMessages(prev => [
      ...prev,
      { role: "assistant", content: "❌ Changes rejected" }
    ])
  }

  /* =========================
     Root Logic
  ========================= */

  async function handleUpdateRoot() {
    try {
      const res = await post("/set-root", { path: rootPath })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Invalid path")
      }

      // save to localStorage
      localStorage.setItem("rootPath", rootPath)

      setRootStatus({
        type: "success",
        message: "Root updated successfully"
      })
    } catch (err) {
      setRootStatus({
        type: "error",
        message: err.message
      })
    }
  }

  /* =========================
     UI Logic
  ========================= */

  async function handleCopy(text, index) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 1200)
    } catch (e) {
      console.error("Copy failed", e)
    }
  }

  /* =========================
     Render Helpers
  ========================= */

  function renderMessage(msg, i) {
    const isUser = msg.role === "user"

    if (isUser) {
      return (
        <>
          <div className="userBubble">{msg.content}</div>

          <div className="messageActions right">
            <CopyButton
              text={msg.content}
              index={i}
              copiedIndex={copiedIndex}
              onCopy={handleCopy}
              label="Copy message"
            />
          </div>
        </>
      )
    }

    return (
      <div className="assistantMessage">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {msg.content}
        </ReactMarkdown>

        <div className="messageActions left">
          <CopyButton
            text={msg.content}
            index={i}
            copiedIndex={copiedIndex}
            onCopy={handleCopy}
            label="Copy response"
          />
        </div>
      </div>
    )
  }

  /* =========================
     JSX
  ========================= */

  return (
    <div className="appContainer">

      {/* HEADER */}
      <div className="appHeader">
        <div className="headerLeft">Cortex Code</div>

        <div className="headerRight">
          <button className="helpBtn" onClick={() => setShowHelp(true)}>
            Help
          </button>
        </div>
      </div>

      {/* HELP MODAL */}
      {showHelp && (
        <div className="helpOverlay" onClick={() => setShowHelp(false)}>
          <div className="helpModal modalWithClose" onClick={(e) => e.stopPropagation()}>

            <button className="modalCloseBtn" onClick={() => setShowHelp(false)}>
              ×
            </button>

            <div className="helpHeader" style={{ justifyContent: "center" }}>
              Help
            </div>

            <div style={{ textAlign: "left", lineHeight: 1.6 }}>
              <p><strong>Description:</strong><br />
                AI assistant for your project workspace.
              </p>

              <p><strong>Chat:</strong><br />
                Ask questions about your codebase.
              </p>

              <p><strong>Edit:</strong><br />
                Request changes before applying them.
              </p>

              <p><strong>Root:</strong><br />
                Set your project folder path.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CHAT */}
      <div className="chatStream">
        {messages.map(renderMessage)}

        {isLoading && <div className="assistantMessage">Thinking...</div>}

        {error && (
          <div className="assistantMessage" style={{ color: "red" }}>
            {error}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* EDIT PANEL */}
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

          <div className="editActions">
            <button className="applyBtn" onClick={applyEdits}>
              Apply
            </button>
            <button className="rejectBtn" onClick={rejectEdits}>
              Reject
            </button>
          </div>
        </div>
      )}

      {/* INPUT */}
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

      {/* ROOT */}
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