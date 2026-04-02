const MODEL_NAME = "llama3";

const readline = require("readline");
const fs = require("fs");
const path = require("path");

// ===== CONFIG =====
let ACTIVE_ROOT = null;
let isWaitingForConfirmation = false;
let pendingEdits = [];
let lastSelectedFiles = [];
let FILE_INDEX = [];

// ===== LIMITS =====
const MAX_FILES = 5;
const MAX_CONTENT_PREVIEW = 300;

// ===== SETUP INPUT =====
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

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

// ===== DETERMINISTIC READ =====
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
            } catch {}
        }
    }

    return results;
}

// ===== FILE TREE INDEX =====
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

// ===== CONTEXT =====
function buildContext(files) {
    return files.map(f =>
        `=== FILE START: ${f.path} ===\n${f.content}\n=== FILE END ===`
    ).join("\n\n");
}

// ===== FILE DETECTION =====
function extractExplicitFiles(text) {
    const matches = text.match(/\b[\w\-.\/]+\.\w+\b/g);
    return matches || [];
}

// ===== DETERMINISTIC SCORING =====
function scoreFiles(userInput) {
    const files = readFolder(ACTIVE_ROOT);
    const input = userInput.toLowerCase();

    const scored = files.map(f => {
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
    });

    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_FILES)
        .filter(f => f.score > 0);
}

// ===== SIMPLE DETERMINISTIC EDIT PARSER =====
function tryDeterministicEdit(userText) {
    const lower = userText.toLowerCase();

    const appendMatch = lower.match(/in (.+?\.\w+),?\s*(add|append)\s+(.+)/);

    if (appendMatch) {
        const file = appendMatch[1];
        const content = userText.split(/add|append/i)[1]
            .trim()
            .replace(/^["']|["']$/g, "");

        return {
            mode: "edit",
            edits: [
                {
                    path: file,
                    action: "append",
                    content: content
                }
            ]
        };
    }

    return null;
}

// ===== JSON EXTRACTION =====
function extractJSON(text) {
    if (!text) return null;
    const match = text.match(/\{[\s\S]*\}/);
    return match ? match[0] : null;
}

// ===== VALIDATION =====
function validateEdits(data) {
    if (!data) return false;
    if (data.mode !== "edit") return false;
    if (!Array.isArray(data.edits)) return false;

    for (const e of data.edits) {
        if (!e.path || !e.action) return false;
        if (!["replace", "create", "append", "delete"].includes(e.action)) return false;
    }

    return true;
}

// ===== AI CALL =====
async function callAI(systemPrompt, userPrompt) {
    try {
        const res = await fetch("http://localhost:11434/api/chat", {
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
        console.error("Error: Is Ollama running?");
        return null;
    }
}

// ===== AI WITH RETRY + REPAIR =====
async function callAIWithRetry(systemPrompt, userPrompt, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        const reply = await callAI(systemPrompt, userPrompt);
        if (!reply) continue;

        let json = extractJSON(reply);

        if (!json) {
            try {
                json = reply
                    .replace(/^[\s\S]*?(\{)/, "$1")
                    .replace(/(\})[\s\S]*$/, "$1");
            } catch {}
        }

        try {
            const parsed = JSON.parse(json);
            if (validateEdits(parsed)) return parsed;
        } catch {}
    }

    return null;
}

// ===== APPLY EDITS =====
function applyEdits(edits) {
    const allowed = new Set(lastSelectedFiles.map(f => path.resolve(f.path)));

    for (const edit of edits) {

        let fullPath;
        try {
            fullPath = toRealPath(edit.path);
        } catch {
            console.log(`Blocked unsafe path: ${edit.path}`);
            continue;
        }

        if (!isSafePath(fullPath)) {
            console.log(`Blocked unsafe path: ${edit.path}`);
            continue;
        }

        if (edit.action !== "create" && !allowed.has(fullPath)) {
            console.log(`Blocked (not selected): ${edit.path}`);
            continue;
        }

        try {
            if (edit.action === "delete") {
                fs.unlinkSync(fullPath);
                console.log(`🗑 Deleted: ${edit.path}`);
            } else if (edit.action === "append") {
                fs.appendFileSync(fullPath, edit.content || "", "utf-8");
                console.log(`➕ Appended: ${edit.path}`);
            } else if (edit.action === "create") {
                fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                fs.writeFileSync(fullPath, edit.content || "", "utf-8");
                console.log(`📄 Created: ${edit.path}`);
            } else if (edit.action === "replace") {
                fs.writeFileSync(fullPath, edit.content || "", "utf-8");
                console.log(`✔ Replaced: ${edit.path}`);
            }
        } catch {
            console.log(`✖ Failed: ${edit.path}`);
        }
    }

    console.log("\nDone.\n");
}

// ===== HANDLE EDITS =====
function handleEdits(edits) {
    console.log("\n=== Proposed Changes ===\n");

    for (const edit of edits) {
        console.log(`--- ${edit.path} (${edit.action}) ---`);
        if (edit.content) {
            console.log(edit.content.substring(0, MAX_CONTENT_PREVIEW));
        }
        console.log("\n");
    }

    pendingEdits = edits;
    isWaitingForConfirmation = true;

    console.log("Apply these changes? (y/n): ");
}

// ===== CHAT SYSTEM =====
function startChat() {

    async function runEditFlow(userText) {

        // 🔥 deterministic shortcut
        const quickEdit = tryDeterministicEdit(userText);
        if (quickEdit) {
            console.log("⚡ Deterministic edit detected");
            handleEdits(quickEdit.edits);
            return;
        }

        const explicitFiles = extractExplicitFiles(userText);
        let selectedFiles = [];

        if (explicitFiles.length > 0) {
            const all = readFolder(ACTIVE_ROOT);
            selectedFiles = all.filter(f =>
                explicitFiles.some(p => f.path.endsWith(p))
            );
        } else {
            selectedFiles = scoreFiles(userText);
        }

        if (selectedFiles.length === 0) {
            console.log("❌ No relevant files found.\n");
            return;
        }

        lastSelectedFiles = selectedFiles;

        const context = buildContext(selectedFiles);

        const systemPrompt = `
You are a code editor.

You MUST output ONLY valid JSON.

FORMAT:
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

EXAMPLE:
{
  "mode": "edit",
  "edits": [
    {
      "path": "red/purple.txt",
      "action": "append",
      "content": "dog"
    }
  ]
}
`;

        const prompt = `
FILES:
${selectedFiles.map(f => f.path).join("\n")}

CONTENT:
${context}

User:
${userText}
`;

        const parsed = await callAIWithRetry(systemPrompt, prompt);

        if (!parsed) {
            console.log("❌ Failed to get valid edits.\n");
            return;
        }

        handleEdits(parsed.edits);
    }

    rl.on("line", async (input) => {

        if (isWaitingForConfirmation) {
            if (input.toLowerCase() === "y") {
                applyEdits(pendingEdits);
            } else {
                console.log("Changes discarded.\n");
            }

            isWaitingForConfirmation = false;
            pendingEdits = [];
            return;
        }

        if (!input.startsWith("/")) {
            console.log("❌ Use /chat or /edit\n");
            return;
        }

        const [command, ...rest] = input.split(" ");
        const userText = rest.join(" ");

        if (command === "/chat") {
            const structure = FILE_INDEX.join("\n");
            const files = scoreFiles(userText);
            const context = buildContext(files);

            const reply = await callAI(
                "Use provided structure only.",
                `TREE:\n${structure}\n\nCONTENT:\n${context}\n\n${userText}`
            );

            console.log("\nAI:", reply, "\n");
            return;
        }

        if (command === "/edit") {
            await runEditFlow(userText);
            return;
        }

        console.log("❌ Unknown command.\n");
    });

    console.log("Use /chat or /edit\n");
}

// ===== START =====
console.log("\n=== Folder Loader ===\n");

function askFolderPath() {
    rl.question("Enter folder path: ", (input) => {
        const folderPath = input.trim();

        if (!folderPath) return askFolderPath();
        if (!fs.existsSync(folderPath)) return askFolderPath();
        if (!fs.statSync(folderPath).isDirectory()) return askFolderPath();

        ACTIVE_ROOT = path.resolve(folderPath);
        FILE_INDEX = buildFileIndex(ACTIVE_ROOT);

        console.log("\nLoaded folder.\n");
        startChat();
    });
}

askFolderPath();