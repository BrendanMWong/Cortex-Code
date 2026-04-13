/**
 * =========================
 * Imports / Dependencies
 * =========================
 */

// Express = HTTP server framework
const express = require("express")

// CORS = allows frontend (different origin) to call this API
const cors = require("cors")

// Custom engine that handles AI + file operations
const engine = require("./engine")


/**
 * =========================
 * App Initialization
 * =========================
 */

const app = express()

// Holds the active server instance (used for start/stop control)
let currentServer = null


/**
 * =========================
 * Middleware
 * =========================
 */

// Enable cross-origin requests (required for frontend → backend communication)
app.use(cors())

// Parse incoming JSON request bodies
app.use(express.json())


/**
 * =========================
 * Utilities
 * =========================
 */

/**
 * asyncHandler
 * Wraps async route handlers so errors automatically pass to Express error middleware.
 *
 * Without this, every async route would need its own try/catch.
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next)
    }
}

/**
 * sendError
 * Standardized error response helper.
 *
 * @param {Response} res - Express response object
 * @param {number} status - HTTP status code
 * @param {Error} error - Error object
 */
function sendError(res, status, error) {
    res.status(status).json({
        error: error?.message || "Unknown error"
    })
}


/**
 * =========================
 * Routes
 * =========================
 */

/**
 * -------- Root Configuration --------
 * Sets the working directory (codebase root) for the engine.
 */
app.post("/set-root", (req, res) => {
    try {
        const { path } = req.body

        // Configure engine with selected project root
        engine.setRoot(path)

        res.json({ ok: true })
    } catch (e) {
        sendError(res, 400, e)
    }
})


/**
 * -------- Chat --------
 * Sends a message to the AI model and returns a response.
 */
app.post("/chat", asyncHandler(async (req, res) => {
    const { message } = req.body

    // Run conversational AI
    const result = await engine.runChat(message)

    res.json(result)
}))


/**
 * -------- Edit Flow --------
 * AI analyzes request and proposes code edits (does NOT apply yet).
 */
app.post("/edit", asyncHandler(async (req, res) => {
    const { message } = req.body

    // Generate proposed edits
    const result = await engine.runEditFlow(message)

    res.json(result)
}))


/**
 * -------- Pending Edits --------
 * Returns all edits waiting for approval.
 */
app.get("/pending-edits", (req, res) => {
    res.json({
        edits: engine.getPendingEdits()
    })
})


/**
 * -------- Apply Edits --------
 * Applies approved edits to the filesystem.
 */
app.post("/apply-edits", (req, res) => {
    try {
        const { edits } = req.body

        // Apply edits to files
        const result = engine.applyEdits(edits)

        res.json(result)
    } catch (e) {
        sendError(res, 500, e)
    }
})


/**
 * -------- Reject Edits --------
 * Clears all pending edits without applying them.
 */
app.post("/reject-edits", (req, res) => {
    try {
        engine.clearPendingEdits()

        res.json({ ok: true })
    } catch (e) {
        sendError(res, 500, e)
    }
})


/**
 * =========================
 * Global Error Handler
 * =========================
 *
 * Catches:
 * - Errors thrown in routes
 * - Errors from asyncHandler
 */
app.use((err, req, res, next) => {
    console.error(err)

    res.status(500).json({
        error: err.message || "Internal Server Error"
    })
})


/**
 * =========================
 * Server Lifecycle Control
 * =========================
 */

/**
 * startServer
 * Starts the Express server (singleton-safe).
 *
 * - Prevents multiple servers from starting
 * - Returns a Promise for async control (useful for Electron)
 */
function startServer(port = 3001) {
    return new Promise((resolve, reject) => {

        // If server already exists, reuse it
        if (currentServer) {
            return resolve(currentServer)
        }

        // Start listening
        currentServer = app.listen(port, () => {
            console.log(`Server running on http://localhost:${port}`)
            resolve(currentServer)
        })

        // Handle startup errors
        currentServer.on("error", (err) => {
            currentServer = null
            reject(err)
        })
    })
}


/**
 * stopServer
 * Gracefully shuts down the server if running.
 */
function stopServer() {
    if (!currentServer) return

    currentServer.close((err) => {
        if (err) {
            console.error("Error closing server:", err)
        }
    })

    currentServer = null
}


/**
 * =========================
 * CLI Entry Point
 * =========================
 *
 * If this file is run directly:
 *   node server.js
 *
 * Then start the server automatically.
 */
if (require.main === module) {
    startServer().catch((err) => {
        console.error(err)
        process.exit(1)
    })
}


/**
 * =========================
 * Exports
 * =========================
 *
 * Used by Electron or other modules to control the server programmatically.
 */
module.exports = {
    startServer,
    stopServer
}