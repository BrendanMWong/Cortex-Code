const fs = require("fs");
const path = require("path");

// Fallback for Node versions
let fetchFn = global.fetch;
if (!fetchFn) {
    fetchFn = require("node-fetch");
}

const MODEL_NAME = "llama3";

// ===== STATE =====
let ACTIVE_ROOT = null;
let lastSelectedFiles = [];

// ===== CONFIG =====
const MAX_FILES = 5;

// ===== SET ROOT =====
function setRoot(folderPath) {
    if (!fs.existsSync(folderPath)) {
        throw new Error("Invalid folder path");
    }

    if (!fs.statSync(folderPath).isDirectory()) {
        throw new Error("Not a directory");
    }

    ACTIVE_ROOT = path.resolve(folderPath);
    return { ok: true };
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
            } catch {}
        }
    }

    return results;
}

function buildContext(files) {
    return files
        .map(f => `=== FILE START: ${f.path} ===\n${f.content}\n=== FILE END ===`)
        .join("\n\n");
}

// ===== SIMPLE SCORING =====
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

// ===== AI CALL =====
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
                stream: false
            })
        });

        const data = await res.json();

        if (!data.message || !data.message.content) {
            throw new Error("Invalid Ollama response");
        }

        return data.message.content;

    } catch (e) {
        console.error("Ollama error:", e.message);
        return null;
    }
}

// ===== MAIN CHAT =====
async function runChat(userText) {
    if (!ACTIVE_ROOT) throw new Error("Root not set");

    const files = scoreFiles(userText);

    if (files.length === 0) {
        return { reply: "No relevant files found." };
    }

    lastSelectedFiles = files;

    const context = buildContext(files);

    const reply = await callAI(
        "You are a helpful coding assistant.",
        `FILES:\n${files.map(f => f.path).join("\n")}\n\nCONTENT:\n${context}\n\nUser: ${userText}`
    );

    return { reply: reply || "AI failed to respond" };
}

// ===== EDIT FLOW =====
async function runEditFlow(userText) {
    if (!ACTIVE_ROOT) throw new Error("Root not set");

    const files = scoreFiles(userText);

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
      "action": "replace",
      "content": "text"
    }
  ]
}
`;

    const reply = await callAI(systemPrompt, `${context}\n\n${userText}`);

    if (!reply) {
        return { error: "AI failed" };
    }

    let parsed;
    try {
        parsed = JSON.parse(reply);
    } catch {
        return { error: "Invalid JSON from AI" };
    }

    return { ok: true, edits: parsed.edits || [] };
}

// ===== EXPORTS =====
module.exports = {
    setRoot,
    runChat,
    runEditFlow
};