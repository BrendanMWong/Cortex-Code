const MODEL_NAME = "llama3";

const readline = require("readline");
const fs = require("fs");
const path = require("path");

// Setup Input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Read Folder
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
                results.push({
                    path: fullPath,
                    content
                });
            } catch (err) {
                // skip non-text files
            }
        }
    }

    return results;
}

// Start Program
console.log("\n=== Folder Loader ===\n");

function askFolderPath() {
    rl.question("Enter folder path: ", (input) => {
        const folderPath = input.trim();

        if (!folderPath) {
            console.log("Path cannot be empty.\n");
            return askFolderPath();
        }

        if (!fs.existsSync(folderPath)) {
            console.log("Path doesn't exist.\n");
            return askFolderPath();
        }

        if (!fs.statSync(folderPath).isDirectory()) {
            console.log("That is not a folder.\n");
            return askFolderPath();
        }

        try {
            const files = readFolder(folderPath);

            const context = files.map(f =>
                `=== FILE START: ${f.path} ===\n${f.content}\n=== FILE END ===`
            ).join("\n\n");

            console.log("\nLoaded files into context.\n");

            startChat(context);

        } catch (err) {
            console.log("Error reading folder.\n");
            askFolderPath();
        }
    });
}

askFolderPath();

// Chat System
function startChat(context) {
    let messages = [
        {
            role: "system",
            content: `You are a codebase reader.`
        }
    ];

    async function chat(userInput) {

        const prompt = `
You are given a codebase.

===== CODEBASE START =====
${context}
===== CODEBASE END =====

User Question:
${userInput}
`;

        messages.push({
            role: "user",
            content: prompt
        });

        try {
            const res = await fetch("http://localhost:11434/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: MODEL_NAME,
                    messages,
                    stream: false
                })
            });

            const data = await res.json();
            const reply = data.message.content;

            messages.push({ role: "assistant", content: reply });

            console.log("\nAI:", reply, "\n");

        } catch (err) {
            console.error("Error: Is Ollama running?");
        }
    }

    function prompt() {
        rl.question("You: ", async (input) => {
            await chat(input);
            prompt();
        });
    }

    prompt();
}