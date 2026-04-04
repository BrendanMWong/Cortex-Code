const MODEL_NAME = "llama3";

const readline = require("readline");
const fs = require("fs");
const path = require("path");

// ===== CONFIG =====
let ACTIVE_ROOT = null;
let isWaitingForConfirmation = false;
let pendingEdits = [];

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

// Convert AI virtual path → real filesystem path
function toRealPath(vPath) {
    const cleaned = vPath.replace(/^\/+/, "");
    const resolved = path.resolve(ACTIVE_ROOT, cleaned);

    if (!resolved.startsWith(path.resolve(ACTIVE_ROOT))) {
        throw new Error("Path traversal detected");
    }

    return resolved;
}

// ===== READ FOLDER =====
function readFolder(dir) {
    let results = [];

    const files = fs.readdirSync(dir);

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

// ===== BUILD CONTEXT =====
function buildContext(files) {
    return files.map(f =>
        `=== FILE START: ${f.path} ===\n${f.content}\n=== FILE END ===`
    ).join("\n\n");
}

// ===== GET FILES BY PATH =====
function getFilesByPaths(paths) {
    const all = readFolder(ACTIVE_ROOT);

    return all.filter(f =>
        paths.some(p => f.path.endsWith(p))
    );
}

// ===== DETECT EXPLICIT FILE =====
function extractExplicitFiles(text) {
    const matches = text.match(/\b[\w\-.\/]+\.txt\b/g);
    return matches || [];
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
                stream: false
            })
        });

        const data = await res.json();
        return data.message.content;

    } catch {
        console.error("Error: Is Ollama running?");
        return null;
    }
}

// ===== APPLY EDITS =====
function applyEdits(edits) {
    for (const edit of edits) {

        let fullPath;
        try {
            fullPath = toRealPath(edit.path);
        } catch (err) {
            console.log(`Blocked unsafe path: ${edit.path}`);
            continue;
        }

        if (!isSafePath(fullPath)) {
            console.log(`Blocked unsafe path: ${edit.path}`);
            continue;
        }

        try {
            if (edit.action === "delete") {
                fs.unlinkSync(fullPath);
                console.log(`🗑 Deleted: ${edit.path}`);

            } else if (edit.action === "append") {
                fs.appendFileSync(fullPath, edit.content, "utf-8");
                console.log(`➕ Appended: ${edit.path}`);

            } else if (edit.action === "create") {
                fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                fs.writeFileSync(fullPath, edit.content, "utf-8");
                console.log(`📄 Created: ${edit.path}`);

            } else if (edit.action === "replace") {
                fs.writeFileSync(fullPath, edit.content, "utf-8");
                console.log(`✔ Replaced: ${edit.path}`);

            } else {
                console.log(`✖ Unknown action: ${edit.action}`);
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
            console.log(edit.content.substring(0, 300));
        }
        console.log("\n");
    }

    pendingEdits = edits;
    isWaitingForConfirmation = true;

    console.log("Apply these changes? (y/n): ");
}

// ===== FILE SELECTION =====
async function selectFiles(userInput) {
    const context = buildContext(readFolder(ACTIVE_ROOT));

    const systemPrompt = `
You are a file selector.

Return ONLY JSON:

{
  "files": ["file1.txt"]
}
`;

    const userPrompt = `
===== CODEBASE =====
${context}

User request:
${userInput}
`;

    const reply = await callAI(systemPrompt, userPrompt);

    try {
        const parsed = JSON.parse(reply);
        return parsed.files || [];
    } catch {
        console.log("❌ Failed to select files.");
        return [];
    }
}

// ===== CHAT SYSTEM =====
function startChat() {

    async function runEditFlow(userText) {

        const explicitFiles = extractExplicitFiles(userText);
        let selectedFiles = [];

        if (explicitFiles.length > 0) {
            console.log("📌 Explicit file detected:", explicitFiles);
            selectedFiles = getFilesByPaths(explicitFiles);
        } else {
            console.log("🧠 Vague request → selecting files...");
            const selectedPaths = await selectFiles(userText);
            selectedFiles = getFilesByPaths(selectedPaths);
        }

        const context = buildContext(selectedFiles);

        const systemPrompt = `
You are a codebase editor.

You MUST respond ONLY in valid JSON:

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

        const prompt = `
===== CODEBASE =====
${context}

User:
${userText}
`;

        const reply = await callAI(systemPrompt, prompt);

        let parsed;

        try {
            parsed = JSON.parse(reply);
        } catch {
            console.log("❌ AI did not return valid JSON.\n");
            console.log(reply, "\n");
            return;
        }

        if (parsed.mode === "edit" && parsed.edits?.length > 0) {
            handleEdits(parsed.edits);
        } else {
            console.log("❌ No valid edits returned.\n");
        }
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
            const context = buildContext(readFolder(ACTIVE_ROOT));

            const reply = await callAI(
                "Answer normally.",
                context + "\n\n" + userText
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

        console.log("\nLoaded folder.\n");
        startChat();
    });
}

askFolderPath();