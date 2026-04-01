const MODEL_NAME = "deepseek-coder:6.7b";

const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let messages = [
  { role: "system", content: "You are a helpful assistant." }
];

async function chat(userInput) {
  messages.push({ role: "user", content: userInput });

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
}

function prompt() {
  rl.question("You: ", async (input) => {
    await chat(input);
    prompt();
  });
}

prompt();