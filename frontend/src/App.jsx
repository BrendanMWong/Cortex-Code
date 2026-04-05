import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './App.css'

function App() {
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

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
    setError(null)

    const userMessage = { role: "user", content: input }
    setMessages(prev => [...prev, userMessage])

    setIsLoading(true)

    try {
      const res = await fetch("http://localhost:3001/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input })
      })

      if (!res.ok) {
        throw new Error("Request failed")
      }

      const data = await res.json()

      const aiMessage = {
        role: "assistant",
        content: data.reply || data.error || "No response"
      }

      setMessages(prev => [...prev, aiMessage])
    } catch (err) {
      setError("AI failed to respond")
    }

    setIsLoading(false)
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

  async function handleCopy(text, index) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(index)

      setTimeout(() => setCopiedIndex(null), 1200)
    } catch (e) {
      console.error("Copy failed", e)
    }
  }

  async function rejectEdits() {
    try {
      await fetch("http://localhost:3001/reject-edits", {
        method: "POST"
      })

      setEdits(null)

      setMessages(prev => [...prev, {
        role: "assistant",
        content: "❌ Changes rejected"
      }])
    } catch (e) {
      console.error("Reject failed", e)
    }
  }

  return (
    <div className="appContainer">

      {/* HEADER */}
      <div className="appHeader">
        <div className="headerLeft">
          Cortex Code
        </div>

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

            {/* Red close button */}
            <button
              className="modalCloseBtn"
              onClick={() => setShowHelp(false)}
            >
              ×
            </button>

            {/* Centered title */}
            <div className="helpHeader" style={{ justifyContent: "center" }}>
              <span>Help</span>
            </div>

            {/* Left-aligned content */}
            <div style={{ textAlign: "left", lineHeight: 1.6 }}>
              <p>
                <strong>Description:</strong><br />
                This is an AI agent that can read your project folder and help you answer questions and write code.
                There are no monetary costs while using this AI assistant.
              </p>

              <p>
                <strong>Chat Button:</strong><br />
                Ask the AI anything. The AI will not edit your codebase.<br />
                Example: <em>"What is your favorite file in the codebase?"</em>
              </p>

              <p>
                <strong>Edit Button:</strong><br />
                Command the AI to make changes to your codebase.
                This lets the AI suggest changes to your files first, before applying them.
              </p>

              <p>
                <strong>Workspace Root:</strong><br />
                This is the folder where your project lives on your computer.<br />
                Example path:<br />
                <code>C:\Users\YourName\foldername\foldername2</code><br />
              </p>

              <p>
                <strong>Copy Icon:</strong><br />
                Click the copy icon to copy any message to your clipboard.
              </p>

              <p>
                <strong>Important:</strong><br />
                The AI cannot access your whole computer. It only works with the files inside the workspace you provide.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CHAT STREAM */}
      <div className="chatStream">
        {messages.map((msg, i) => (
          <div key={i} className="messageRow">

            {msg.role === "user" ? (
              <>
                <div className="userBubble">
                  {msg.content}
                </div>

                <div className="messageActions right">
                  <div className="copyWrapper">
                    <button
                      className="copyBtn"
                      onClick={() => handleCopy(msg.content, i)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24">
                        <rect x="9" y="9" width="10" height="10" rx="2" opacity="0.55" />
                        <rect x="5" y="5" width="10" height="10" rx="2" opacity="0.3" />
                      </svg>
                    </button>

                    <div className="copyTooltip">
                      {copiedIndex === i ? "Copied" : "Copy message"}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="assistantMessage">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>

                <div className="messageActions left">
                  <div className="copyWrapper">
                    <button
                      className="copyBtn"
                      onClick={() => handleCopy(msg.content, i)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24">
                        <rect x="9" y="9" width="10" height="10" rx="2" opacity="0.55" />
                        <rect x="5" y="5" width="10" height="10" rx="2" opacity="0.3" />
                      </svg>                    </button>

                    <div className="copyTooltip">
                      {copiedIndex === i ? "Copied" : "Copy response"}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="assistantMessage">Thinking...</div>
        )}

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
              Apply Changes
            </button>

            <button className="rejectBtn" onClick={rejectEdits}>
              Reject Changes
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