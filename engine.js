/**
 * =========================
 * Imports / Dependencies
 * =========================
 */

// File system access (read/write project files)
const fs = require("fs")

// Path utilities (safe path resolution)
const path = require("path")


/**
 * =========================
 * Fetch Setup
 * =========================
 *
 * Uses global fetch if available (Node 18+),
 * otherwise falls back to node-fetch.
 */

let fetchFn = global.fetch
if (!fetchFn) {
    fetchFn = require("node-fetch")
}

// Ollama model to use
const MODEL_NAME = "llama3"


/**
 * =========================
 * Config
 * =========================
 */

// Max number of files to send to AI context
const MAX_FILES = 10

// (Currently unused) max preview length for file content
const MAX_CONTENT_PREVIEW = 300


/**
 * =========================
 * Runtime State
 * =========================
 */

// Root directory of the user's selected project
let ACTIVE_ROOT = null

// Cached file index (flat list of project structure)
let FILE_INDEX = []

// Edits proposed by AI but not yet applied
let pendingEdits = []

// Files selected during last edit operation (used for safety)
let lastSelectedFiles = []


/**
 * =========================
 * Root Management
 * =========================
 */

/**
 * setRoot
 * Validates and sets the working directory for the engine.
 * Also builds a file index for quick reference.
 */
function setRoot(folderPath) {
    if (!fs.existsSync(folderPath)) {
        throw new Error("Invalid folder path")
    }

    if (!fs.statSync(folderPath).isDirectory()) {
        throw new Error("Not a directory")
    }

    ACTIVE_ROOT = path.resolve(folderPath)

    // Build a recursive index of all files/folders
    FILE_INDEX = buildFileIndex(ACTIVE_ROOT)

    return { ok: true }
}


/**
 * =========================
 * File Indexing
 * =========================
 */

/**
 * Recursively builds a flat list of all files and directories.
 * Format:
 *   [DIR] folder
 *   [FILE] folder/file.js
 */
function buildFileIndex(dir, prefix = "") {
    let results = []

    const items = fs.readdirSync(dir).sort()

    for (const item of items) {
        const fullPath = path.join(dir, item)
        const stat = fs.statSync(fullPath)
        const relative = path.join(prefix, item)

        if (stat.isDirectory()) {
            results.push(`[DIR] ${relative}`)
            results = results.concat(buildFileIndex(fullPath, relative))
        } else {
            results.push(`[FILE] ${relative}`)
        }
    }

    return results
}


/**
 * =========================
 * Path Safety Utilities
 * =========================
 */

/**
 * Ensures a path stays inside ACTIVE_ROOT.
 * Prevents directory traversal attacks.
 */
function isSafePath(filePath) {
    const resolved = path.resolve(filePath)
    const root = path.resolve(ACTIVE_ROOT)

    return resolved.startsWith(root) && !resolved.includes("..")
}

/**
 * Converts a "virtual" path (from AI/user) into a real filesystem path.
 * Throws if traversal outside root is detected.
 */
function toRealPath(vPath) {
    const cleaned = vPath.replace(/^\/+/, "")
    const resolved = path.resolve(ACTIVE_ROOT, cleaned)

    if (!resolved.startsWith(path.resolve(ACTIVE_ROOT))) {
        throw new Error("Path traversal detected")
    }

    return resolved
}


/**
 * =========================
 * File Reading / Context
 * =========================
 */

/**
 * Recursively reads all files under a directory.
 * Returns:
 *   [{ path, content }]
 */
function readFolder(dir) {
    let results = []

    const files = fs.readdirSync(dir).sort()

    for (const file of files) {
        const fullPath = path.join(dir, file)
        const stat = fs.statSync(fullPath)

        if (stat.isDirectory()) {
            results = results.concat(readFolder(fullPath))
        } else {
            try {
                const content = fs.readFileSync(fullPath, "utf-8")
                results.push({ path: fullPath, content })
            } catch {
                // Ignore unreadable files
            }
        }
    }

    return results
}

/**
 * Builds a formatted string context for AI.
 * Each file is wrapped with markers.
 */
function buildContext(files) {
    return files
        .map(f => `=== FILE START: ${f.path} ===\n${f.content}\n=== FILE END ===`)
        .join("\n\n")
}


/**
 * =========================
 * File Selection Logic
 * =========================
 */

/**
 * Extracts explicit file references from user input.
 * Example: "edit src/app.js"
 */
function extractExplicitFiles(text) {
    return text.match(/\b[\w\-.\\\/]+\.\w+\b/g) || []
}

/**
 * Creates placeholder file objects when explicit files
 * are mentioned but not found.
 */
function buildExplicitFilePlaceholders(paths) {
    return paths.map((p) => {
        const cleaned = p.replace(/^\/+/, "")
        return {
            path: path.resolve(ACTIVE_ROOT, cleaned),
            content: ""
        }
    })
}

/**
 * Scores files based on relevance to user input.
 * Simple heuristic:
 *   - filename match = high score
 *   - content keyword matches = lower score
 */
function scoreFiles(userInput) {
    const files = readFolder(ACTIVE_ROOT)
    const input = userInput.toLowerCase()

    return files
        .map(f => {
            let score = 0

            const name = path.basename(f.path).toLowerCase()
            const content = f.content.toLowerCase()

            if (input.includes(name)) score += 5

            const words = input.split(/\W+/)
            for (const w of words) {
                if (!w) continue
                if (name.includes(w)) score += 2
                if (content.includes(w)) score += 1
            }

            return { ...f, score }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_FILES)
        .filter(f => f.score > 0)
}


/**
 * =========================
 * AI Communication
 * =========================
 */

/**
 * Sends a request to the local Ollama API.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {number} temperature
 */
async function callAI(systemPrompt, userPrompt, temperature = 0) {
    try {
        const res = await fetchFn("http://localhost:11434/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                stream: false,
                options: { temperature }
            })
        })

        const data = await res.json()
        return data.message.content
    } catch {
        // Failure = null (handled upstream)
        return null
    }
}


/**
 * =========================
 * AI Output Parsing
 * =========================
 */

/**
 * Cleans malformed triple-quoted strings into valid JSON.
 */
function normalizeJsonCandidate(jsonText) {
    if (!jsonText) return jsonText

    return jsonText.replace(/"""\s*([\s\S]*?)\s*"""/g, (_, inner) => {
        return JSON.stringify(inner.replace(/\r/g, ""))
    })
}

/**
 * Extracts:
 *   - explanation (text)
 *   - JSON edit plan
 * from AI response.
 */
function extractJsonAndExplanation(text) {
    if (!text) return { explanation: null, jsonText: null }

    const fenceMatch = text.match(/```json\s*([\s\S]*?)```/)
    let jsonText = null
    let explanation = null

    if (fenceMatch) {
        jsonText = fenceMatch[1]
        explanation = text.slice(0, fenceMatch.index).trim()
    } else {
        const matches = text.match(/\{[\s\S]*\}/g)
        if (!matches) return { explanation: null, jsonText: null }

        const lastMatch = matches[matches.length - 1]
        const index = text.lastIndexOf(lastMatch)

        explanation = text.slice(0, index).trim()
        jsonText = lastMatch
    }

    if (explanation) {
        explanation = explanation
            .replace(/(?:Here is the JSON representation of the edit:|Here is the plan:)\s*$/i, "")
            .trim()

        if (!explanation) explanation = null
    }

    return {
        explanation,
        jsonText: normalizeJsonCandidate(jsonText)
    }
}

/**
 * Validates AI-generated edit structure.
 */
function validateEdits(data) {
    if (!data) return false
    if (data.mode !== "edit") return false
    if (!Array.isArray(data.edits)) return false

    return data.edits.every(e =>
        typeof e.path === "string" &&
        typeof e.action === "string" &&
        ["replace", "create", "append", "delete"].includes(e.action)
    )
}


/**
 * =========================
 * Edit Application
 * =========================
 */

/**
 * Applies edits to the filesystem with safety constraints:
 * - Only allows edits on previously selected files
 * - Prevents path traversal
 */
function applyEdits(edits) {
    const allowed = new Set(
        lastSelectedFiles.map(f => path.resolve(f.path))
    )

    for (const edit of edits) {
        let fullPath

        try {
            fullPath = toRealPath(edit.path)
        } catch {
            continue
        }

        if (!isSafePath(fullPath)) continue
        if (edit.action !== "create" && !allowed.has(fullPath)) continue

        try {
            if (edit.action === "delete") {
                fs.unlinkSync(fullPath)

            } else if (edit.action === "append") {
                const existing = fs.existsSync(fullPath)
                    ? fs.readFileSync(fullPath, "utf-8")
                    : ""

                let content = edit.content || ""

                if (existing && !existing.endsWith("\n")) {
                    content = "\n" + content
                }

                fs.appendFileSync(fullPath, content, "utf-8")

            } else if (edit.action === "create") {
                fs.mkdirSync(path.dirname(fullPath), { recursive: true })
                fs.writeFileSync(fullPath, edit.content || "", "utf-8")

            } else if (edit.action === "replace") {
                // Full overwrite
                fs.writeFileSync(fullPath, edit.content || "", "utf-8")
            }

        } catch {
            // Ignore individual edit failures
        }
    }

    pendingEdits = []
    return { ok: true }
}


/**
 * =========================
 * Edit Flow (AI-driven)
 * =========================
 */

async function runEditFlow(userText) {
    if (!ACTIVE_ROOT) throw new Error("Root not set")

    // Step 1: determine relevant files
    const explicit = extractExplicitFiles(userText)

    let files
    if (explicit.length > 0) {
        const matched = readFolder(ACTIVE_ROOT).filter(f =>
            explicit.some(p =>
                f.path.toLowerCase().endsWith(p.toLowerCase())
            )
        )

        files = matched.length > 0
            ? matched
            : buildExplicitFilePlaceholders(explicit)
    } else {
        files = scoreFiles(userText)
    }

    if (!files.length) {
        return { error: "No relevant files found." }
    }

    lastSelectedFiles = files

    const context = buildContext(files)

    // Step 2: instruct AI to generate edits
    const systemPrompt = `
You are a code editor.

First describe in plain language what changes you will make.
Then on a new line, provide only valid JSON describing the edit plan.
The JSON must be the last thing in your response.
Do not wrap the JSON in markdown or code fences.
If the user wants a file cleared, prefer action "delete" or "replace" with empty content.
Do not include file markers like === FILE START === in the JSON content.
Preferred JSON format:
{
  "mode": "edit",
  "edits": [
    {
      "path": "file path",
      "action": "replace",
      "content": "full file content"
    }
  ]
}
`

    const reply = await callAI(systemPrompt, `${context}\n\n${userText}`)

    if (!reply) return { error: "AI failed" }

    // Step 3: parse AI output
    const { explanation, jsonText } = extractJsonAndExplanation(reply)

    if (jsonText) {
        try {
            const parsed = JSON.parse(jsonText)

            if (validateEdits(parsed)) {
                pendingEdits = parsed.edits

                return {
                    ok: true,
                    edits: pendingEdits,
                    explanation
                }
            }
        } catch {
            // JSON parse failed
        }
    }

    // Step 4: fallback behavior
    if (explanation) {
        return {
            error: "AI output unusable",
            explanation
        }
    }

    // Single-file fallback = replace entire file
    if (files.length === 1) {
        pendingEdits = [{
            path: files[0].path,
            action: "replace",
            content: reply
        }]

        return { ok: true, edits: pendingEdits, fallback: true }
    }

    return { error: "AI output unusable" }
}


/**
 * =========================
 * Chat Flow (non-edit)
 * =========================
 */

async function runChat(userText) {
    if (!ACTIVE_ROOT) throw new Error("Root not set")

    const files = scoreFiles(userText)

    if (!files.length) {
        return { reply: "I couldn't find anything relevant in your project." }
    }

    const context = buildContext(files)

    const systemPrompt = "You are a helpful coding assistant."

    const reply = await callAI(
        systemPrompt,
        `PROJECT CONTEXT:\n${context}\n\nUser: ${userText}`,
        0.7
    )

    return { reply: reply || "AI failed to respond" }
}


/**
 * =========================
 * Edit State Access
 * =========================
 */

function getPendingEdits() {
    return pendingEdits
}

function clearPendingEdits() {
    pendingEdits = []
    lastSelectedFiles = []
}


/**
 * =========================
 * Exports
 * =========================
 */

module.exports = {
    setRoot,
    runChat,
    runEditFlow,
    applyEdits,
    getPendingEdits: () => pendingEdits,
    clearPendingEdits: () => {
        pendingEdits = []
        lastSelectedFiles = []
    }
}