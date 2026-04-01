const MODEL_NAME = "deepseek-coder:6.7b";

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
    return resolved.startsWith(ACTIVE_ROOT);
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

// ===== APPLY EDITS =====
function applyEdits(edits) {
    for (const edit of edits) {

        if (!isSafePath(edit.path)) {
            console.log(`Blocked unsafe path: ${edit.path}`);
            continue;
        }

        const fullPath = path.resolve(edit.path);

        try {
            if (edit.action === "delete") {
                fs.unlinkSync(fullPath);
                console.log(`🗑 Deleted: ${edit.path}`);

            } else if (edit.action === "append") {
                fs.appendFileSync(fullPath, edit.content, "utf-8");
                console.log(`➕ Appended: ${edit.path}`);

            } else if (edit.action === "create") {
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

// ===== CHAT SYSTEM =====
function startChat(context) {

    async function callAI(userInput, forceEdit = false) {

        const systemPrompt = forceEdit
            ? `
You are a codebase editor.

You MUST respond ONLY in valid JSON.

Format:
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

Rules:
- NO explanations
- NO extra text
- ONLY JSON
`
            : `
You are a codebase assistant.
Answer normally and clearly.
`;

        const prompt = `
===== CODEBASE =====
${context}

User:
${userInput}
`;

        try {
            const res = await fetch("http://localhost:11434/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: MODEL_NAME,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: prompt }
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

    rl.on("line", async (input) => {

        // ===== CONFIRMATION MODE =====
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

        // ===== COMMAND PARSING =====
        if (!input.startsWith("/")) {
            console.log("❌ Error: You must use /chat or /edit\n");
            return;
        }

        const [command, ...rest] = input.split(" ");
        const userText = rest.join(" ");

        // ===== CHAT MODE =====
        if (command === "/chat") {
            const reply = await callAI(userText, false);
            console.log("\nAI:", reply, "\n");
            return;
        }

        // ===== EDIT MODE =====
        if (command === "/edit") {
            const reply = await callAI(userText, true);

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

            return;
        }

        console.log("❌ Unknown command. Use /chat or /edit\n");
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

        // ✅ SET ACTIVE ROOT HERE (FIX)
        ACTIVE_ROOT = path.resolve(folderPath);

        const files = readFolder(folderPath);

        const context = files.map(f =>
            `=== FILE START: ${f.path} ===\n${f.content}\n=== FILE END ===`
        ).join("\n\n");

        console.log("\nLoaded files into context.\n");

        startChat(context);
    });
}

askFolderPath();