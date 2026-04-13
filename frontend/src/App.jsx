import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './App.css'

/**
 * =========================
 * Backend API Base URL
 * =========================
 */
const API_URL = "http://localhost:3001"


/**
 * =========================
 * Reusable UI Component
 * =========================
 *
 * CopyButton
 * - Copies text to clipboard
 * - Shows transient "Copied" state
 */
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


/**
 * =========================
 * Main Application Component
 * =========================
 */
function App() {

  /**
   * =========================
   * State Management
   * =========================
   */

  // Chat input field
  const [input, setInput] = useState("")

  // Chat message history (user + assistant)
  const [messages, setMessages] = useState([])

  // Pending AI-generated edits
  const [edits, setEdits] = useState(null)

  // Workspace root folder path
  const [rootPath, setRootPath] = useState("")

  // Status message for root updates
  const [rootStatus, setRootStatus] = useState(null)

  // UI state: loading indicator for AI calls
  const [isLoading, setIsLoading] = useState(false)

  // Global error state
  const [error, setError] = useState(null)

  // Clipboard feedback tracking
  const [copiedIndex, setCopiedIndex] = useState(null)

  // Help modal visibility
  const [showHelp, setShowHelp] = useState(false)

  // Used to auto-scroll chat view
  const chatEndRef = useRef(null)


  /**
   * =========================
   * Side Effects
   * =========================
   */

  // Auto-scroll chat to latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, isLoading, edits])

  // Load saved workspace root from localStorage
  useEffect(() => {
    const savedRoot = localStorage.getItem("rootPath")
    if (savedRoot) {
      setRootPath(savedRoot)
    }
  }, [])

  // Sync saved root with backend on startup
  useEffect(() => {
    const savedRoot = localStorage.getItem("rootPath")
    if (savedRoot) {
      fetch(`${API_URL}/set-root`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: savedRoot })
      }).catch(() => { })
    }
  }, [])


  /**
   * =========================
   * API Helpers
   * =========================
   */

  async function post(endpoint, body) {
    return fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    })
  }

  async function postJSON(endpoint, body) {
    const res = await post(endpoint, body)
    return res.json()
  }


  /**
   * =========================
   * Chat Flow
   * =========================
   */

  async function sendChat() {
    if (!input.trim()) return

    setError(null)
    setEdits(null)

    // Append user message immediately
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


  /**
   * =========================
   * Edit Flow
   * =========================
   */

  async function sendEdit() {
    setError(null)

    try {
      const data = await postJSON("/edit", { message: input })

      if (data.error) {
        setError(data.error)
        return
      }

      // Optional explanation message from AI
      if (data.explanation) {
        setMessages(prev => [
          ...prev,
          { role: "assistant", content: data.explanation }
        ])
      }

      // Store proposed edits for review UI
      if (data.edits) {
        setEdits(data.edits)
      } else {
        setError("No edits returned")
      }

    } catch {
      setError("Edit request failed")
    }
  }

  /**
   * Apply approved edits to filesystem
   */
  async function applyEdits() {
    await post("/apply-edits", { edits })

    setEdits(null)

    setMessages(prev => [
      ...prev,
      { role: "assistant", content: "✅ Changes applied" }
    ])
  }

  /**
   * Reject all pending edits
   */
  async function rejectEdits() {
    await post("/reject-edits")

    setEdits(null)

    setMessages(prev => [
      ...prev,
      { role: "assistant", content: "❌ Changes rejected" }
    ])
  }


  /**
   * =========================
   * Workspace Root Handling
   * =========================
   */

  async function handleUpdateRoot() {
    try {
      const res = await post("/set-root", { path: rootPath })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Invalid path")
      }

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


  /**
   * =========================
   * Clipboard Utility
   * =========================
   */

  async function handleCopy(text, index) {
    try {
      await navigator.clipboard.writeText(text)

      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 1200)

    } catch (e) {
      console.error("Copy failed", e)
    }
  }


  /**
   * =========================
   * Message Renderer
   * =========================
   */

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


  /**
   * =========================
   * JSX Render
   * =========================
   */

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


      {/* CHAT WINDOW */}
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


      {/* EDIT PREVIEW PANEL */}
      {edits && (
        <div className="editPanel">
          <div className="panelHeader">Proposed Changes</div>

          {edits.map((e, i) => (
            <div key={i} className="editItem">
              <div className="editPath">{e.path}</div>
              <div className="editAction">{e.action}</div>

              <pre className="editContent">
                {e.content || ""}
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


      {/* ROOT CONFIGURATION */}
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