const fs = require("fs")
const path = require("path")

/* =========================
   Fetch Setup
========================= */

let fetchFn = global.fetch
if (!fetchFn) {
    fetchFn = require("node-fetch")
}

const MODEL_NAME = "llama3"

/* =========================
   CONFIG
========================= */

const MAX_FILES = 10
const MAX_CONTENT_PREVIEW = 300

/* =========================
   STATE
========================= */

let ACTIVE_ROOT = null
let FILE_INDEX = []
let pendingEdits = []
let lastSelectedFiles = []

/* =========================
   ROOT MANAGEMENT
========================= */

function setRoot(folderPath) {
    if (!fs.existsSync(folderPath)) {
        throw new Error("Invalid folder path")
    }

    if (!fs.statSync(folderPath).isDirectory()) {
        throw new Error("Not a directory")
    }

    ACTIVE_ROOT = path.resolve(folderPath)
    FILE_INDEX = buildFileIndex(ACTIVE_ROOT)

    return { ok: true }
}

/* =========================
   FILE INDEX
========================= */

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

/* =========================
   FILE UTILITIES
========================= */

function isSafePath(filePath) {
    const resolved = path.resolve(filePath)
    const root = path.resolve(ACTIVE_ROOT)

    return resolved.startsWith(root) && !resolved.includes("..")
}

function toRealPath(vPath) {
    const cleaned = vPath.replace(/^\/+/, "")
    const resolved = path.resolve(ACTIVE_ROOT, cleaned)

    if (!resolved.startsWith(path.resolve(ACTIVE_ROOT))) {
        throw new Error("Path traversal detected")
    }

    return resolved
}

/* =========================
   FILE READING
========================= */

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
            } catch { }
        }
    }

    return results
}

function buildContext(files) {
    return files
        .map(f => `=== FILE START: ${f.path} ===\n${f.content}\n=== FILE END ===`)
        .join("\n\n")
}

/* =========================
   FILE SELECTION
========================= */

function extractExplicitFiles(text) {
    return text.match(/\b[\w\-.\\\/]+\.\w+\b/g) || []
}

function buildExplicitFilePlaceholders(paths) {
    return paths.map((p) => {
        const cleaned = p.replace(/^\/+/, "")
        return {
            path: path.resolve(ACTIVE_ROOT, cleaned),
            content: ""
        }
    })
}

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

/* =========================
   AI
========================= */

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
        return null
    }
}

/* =========================
   EDIT PARSING / VALIDATION
========================= */

// ✅ IMPROVED JSON EXTRACTION
function normalizeJsonCandidate(jsonText) {
    if (!jsonText) return jsonText

    return jsonText.replace(/"""\s*([\s\S]*?)\s*"""/g, (_, inner) => {
        return JSON.stringify(inner.replace(/\r/g, ""))
    })
}

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

/* =========================
   EDIT APPLICATION
========================= */

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
                // ✅ ALWAYS allow full overwrite
                fs.writeFileSync(fullPath, edit.content || "", "utf-8")
            }

        } catch { }
    }

    pendingEdits = []
    return { ok: true }
}

/* =========================
   EDIT FLOW
========================= */

async function runEditFlow(userText) {
    if (!ACTIVE_ROOT) throw new Error("Root not set")

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
        } catch { }
    }

    if (explanation) {
        return {
            error: "AI output unusable",
            explanation
        }
    }

    // 🚨 FALLBACK: FORCE REPLACE
    // Only use fallback when no explanation is present
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

/* =========================
   CHAT FLOW
========================= */

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

/* =========================
   EDIT STATE ACCESS
========================= */

function getPendingEdits() {
    return pendingEdits
}

function clearPendingEdits() {
    pendingEdits = []
    lastSelectedFiles = []
}

/* =========================
   EXPORTS
========================= */

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