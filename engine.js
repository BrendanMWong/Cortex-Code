const fs = require("fs");
const path = require("path");

let fetchFn = global.fetch;
if (!fetchFn) {
    fetchFn = require("node-fetch");
}

const MODEL_NAME = "llama3";

// ===== STATE =====
let ACTIVE_ROOT = null;
let lastSelectedFiles = [];
let pendingEdits = [];
let FILE_INDEX = [];

// ===== CONFIG =====
const MAX_FILES = 5;
const MAX_CONTENT_PREVIEW = 300;

// ===== SET ROOT =====
function setRoot(folderPath) {
    if (!fs.existsSync(folderPath)) {
        throw new Error("Invalid folder path");
    }

    if (!fs.statSync(folderPath).isDirectory()) {
        throw new Error("Not a directory");
    }

    ACTIVE_ROOT = path.resolve(folderPath);

    FILE_INDEX = buildFileIndex(ACTIVE_ROOT);

    return { ok: true };
}

// ===== FILE INDEX =====
function buildFileIndex(dir, prefix = "") {
    let lines = [];

    const items = fs.readdirSync(dir).sort();

    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        const relative = path.join(prefix, item);

        if (stat.isDirectory()) {
            lines.push(`[DIR] ${relative}`);
            lines = lines.concat(buildFileIndex(fullPath, relative));
        } else {
            lines.push(`[FILE] ${relative}`);
        }
    }

    return lines;
}

// ===== EXPLICIT FILE DETECTION =====
function extractExplicitFiles(text) {
    const matches = text.match(/\b[\w\-.\/]+\.\w+\b/g);
    return matches || [];
}

// ===== INTENT CLASSIFIER =====
function classifyIntent(text) {
    const lower = text.toLowerCase();

    const signals = ["file", "files", "folder", "directory", "structure", "tree", "list", "show"];

    let score = 0;
    for (const s of signals) {
        if (lower.includes(s)) score++;
    }

    if (score >= 2) return "file_list";

    if (text.match(/\b[\w\-.\/]+\.\w+\b/)) {
        return "file_search";
    }

    return null;
}

// ===== SAFETY =====
function isSafePath(filePath) {
    const resolved = path.resolve(filePath);
    const root = path.resolve(ACTIVE_ROOT);
    return resolved.startsWith(root) && !resolved.includes("..");
}

function toRealPath(vPath) {
    const cleaned = vPath.replace(/^\/+/, "");
    const resolved = path.resolve(ACTIVE_ROOT, cleaned);

    if (!resolved.startsWith(path.resolve(ACTIVE_ROOT))) {
        throw new Error("Path traversal detected");
    }

    return resolved;
}

// ===== FILE SYSTEM =====
function readFolder(dir) {
    let results = [];
    const files = fs.readdirSync(dir).sort();

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            results = results.concat(readFolder(fullPath));
        } else {
            try {
                const content = fs.readFileSync(fullPath, "utf-8");
                results.push({ path: fullPath, content });
            } catch { }
        }
    }

    return results;
}

function buildContext(files) {
    return files
        .map(f => `=== FILE START: ${f.path} ===\n${f.content}\n=== FILE END ===`)
        .join("\n\n");
}

// ===== SCORING =====
function scoreFiles(userInput) {
    const files = readFolder(ACTIVE_ROOT);
    const input = userInput.toLowerCase();

    return files
        .map(f => {
            let score = 0;
            const name = path.basename(f.path).toLowerCase();
            const content = f.content.toLowerCase();

            if (input.includes(name)) score += 5;

            const words = input.split(/\W+/);
            for (const w of words) {
                if (!w) continue;
                if (name.includes(w)) score += 2;
                if (content.includes(w)) score += 1;
            }

            return { ...f, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_FILES)
        .filter(f => f.score > 0);
}

// ===== AI =====
async function callAI(systemPrompt, userPrompt) {
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
                options: { temperature: 0 }
            })
        });

        const data = await res.json();
        return data.message.content;

    } catch {
        return null;
    }
}

// ===== EDIT PARSER =====
function extractJSON(text) {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? match[0] : null;
}

function validateEdits(data) {
    if (!data) return false;
    if (data.mode !== "edit") return false;
    if (!Array.isArray(data.edits)) return false;

    return data.edits.every(e =>
        e.path && e.action &&
        ["replace", "create", "append", "delete"].includes(e.action)
    );
}

// ===== APPLY EDITS =====
function applyEdits(edits) {
    const allowed = new Set(lastSelectedFiles.map(f => path.resolve(f.path)));

    for (const edit of edits) {
        let fullPath;

        try {
            fullPath = toRealPath(edit.path);
        } catch {
            continue;
        }

        if (!isSafePath(fullPath)) continue;

        if (edit.action !== "create" && !allowed.has(fullPath)) continue;

        try {
            if (edit.action === "delete") {
                fs.unlinkSync(fullPath);
            } else if (edit.action === "append") {
                const existing = fs.existsSync(fullPath)
                    ? fs.readFileSync(fullPath, "utf-8")
                    : "";

                let contentToAppend = edit.content || "";

                // Ensure newline separation
                if (existing.length > 0 && !existing.endsWith("\n")) {
                    contentToAppend = "\n" + contentToAppend;
                }

                fs.appendFileSync(fullPath, contentToAppend, "utf-8");
            } else if (edit.action === "create") {
                fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                fs.writeFileSync(fullPath, edit.content || "", "utf-8");
            } else if (edit.action === "replace") {
                fs.writeFileSync(fullPath, edit.content || "", "utf-8");
            }
        } catch { }
    }

    pendingEdits = [];
    return { ok: true };
}

// ===== EDIT FLOW =====
async function runEditFlow(userText) {
    if (!ACTIVE_ROOT) throw new Error("Root not set");

    const explicit = extractExplicitFiles(userText);

    let files;

    if (explicit.length > 0) {
        const all = readFolder(ACTIVE_ROOT);
        files = all.filter(f =>
            explicit.some(p =>
                f.path.toLowerCase().endsWith(p.toLowerCase())
            )
        );
    } else {
        files = scoreFiles(userText);
    }

    if (files.length === 0) {
        return { error: "No relevant files found." };
    }

    lastSelectedFiles = files;

    const context = buildContext(files);

    const systemPrompt = `
You are a code editor.

Return ONLY JSON:
{
  "mode": "edit",
  "edits": [
    {
      "path": "file path",
      "action": "replace | create | append | delete",
      "content": "text"
    }
  ]
}
`;

    const reply = await callAI(systemPrompt, `${context}\n\n${userText}`);

    if (!reply) return { error: "AI failed" };

    let parsed;
    try {
        const json = extractJSON(reply);
        parsed = JSON.parse(json);
    } catch {
        return { error: "Invalid JSON from AI" };
    }

    if (!validateEdits(parsed)) {
        return { error: "Invalid edit format" };
    }

    pendingEdits = parsed.edits;

    return {
        ok: true,
        edits: pendingEdits
    };
}

// ===== CHAT (FINAL FIX) =====
async function runChat(userText) {
    if (!ACTIVE_ROOT) throw new Error("Root not set");

    const lower = userText.toLowerCase();
    const intent = classifyIntent(userText);
    const explicit = extractExplicitFiles(userText);

    // 🔥 STRONG deterministic file list
    if (
        intent === "file_list" ||
        (
            lower.includes("everything") &&
            (lower.includes("codebase") || lower.includes("project"))
        )
    ) {
        return { reply: FILE_INDEX.join("\n") };
    }

    // 🔥 deterministic file read
    if (explicit.length > 0) {
        const all = readFolder(ACTIVE_ROOT);

        const matches = all.filter(f =>
            explicit.some(p =>
                f.path.toLowerCase().endsWith(p.toLowerCase())
            )
        );

        if (matches.length > 0) {
            return {
                reply: matches.map(f =>
                    `=== ${f.path} ===\n${f.content}`
                ).join("\n\n")
            };
        }
    }

    // fallback AI
    const files = scoreFiles(userText);

    if (files.length === 0) {
        return { reply: "No relevant files found." };
    }

    const context = buildContext(files);

    const reply = await callAI(
        "You are a helpful coding assistant.",
        `CONTENT:\n${context}\n\nUser: ${userText}`
    );

    return { reply: reply || "AI failed to respond" };
}

// ===== GET PENDING =====
function getPendingEdits() {
    return pendingEdits;
}

// ===== EXPORTS =====
module.exports = {
    setRoot,
    runChat,
    runEditFlow,
    applyEdits,
    getPendingEdits,
    clearPendingEdits
};

// ===== CLEAR PENDING =====
function clearPendingEdits() {
    pendingEdits = [];
    lastSelectedFiles = [];
}