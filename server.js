const express = require("express")
const cors = require("cors")
const engine = require("./engine")

const app = express()

/* =========================
   Middleware
========================= */

app.use(cors())
app.use(express.json())

/* =========================
   Utilities
========================= */

/**
 * Wrap async routes to avoid repetitive try/catch
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next)
    }
}

/**
 * Safe response helper for errors
 */
function sendError(res, status, error) {
    res.status(status).json({
        error: error?.message || "Unknown error"
    })
}

/* =========================
   Routes
========================= */

/* -------- Root -------- */
app.post("/set-root", (req, res) => {
    try {
        const { path } = req.body
        engine.setRoot(path)
        res.json({ ok: true })
    } catch (e) {
        sendError(res, 400, e)
    }
})

/* -------- Chat -------- */
app.post("/chat", asyncHandler(async (req, res) => {
    const { message } = req.body
    const result = await engine.runChat(message)
    res.json(result)
}))

/* -------- Edit Flow -------- */
app.post("/edit", asyncHandler(async (req, res) => {
    const { message } = req.body
    const result = await engine.runEditFlow(message)
    res.json(result)
}))

/* -------- Pending Edits -------- */
app.get("/pending-edits", (req, res) => {
    res.json({
        edits: engine.getPendingEdits()
    })
})

/* -------- Apply Edits -------- */
app.post("/apply-edits", (req, res) => {
    try {
        const { edits } = req.body
        const result = engine.applyEdits(edits)
        res.json(result)
    } catch (e) {
        sendError(res, 500, e)
    }
})

/* -------- Reject Edits -------- */
app.post("/reject-edits", (req, res) => {
    try {
        engine.clearPendingEdits()
        res.json({ ok: true })
    } catch (e) {
        sendError(res, 500, e)
    }
})

/* =========================
   Error Handler (fallback)
========================= */

app.use((err, req, res, next) => {
    console.error(err)
    res.status(500).json({
        error: err.message || "Internal Server Error"
    })
})

/* =========================
   Start Server
========================= */

const PORT = 3001

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
})