# Cortex-Code-Testing

## Prerequisites

Install the following:

- Node.js  
- Ollama (local LLM runtime)

---

## Setup (run once)

Install the required model:

```bash
ollama pull llama3
```

## Running the system (repeat every time program should start)

### 1. Start Ollama (required)

Run the Ollama server in a terminal:

```bash
ollama serve
```
This starts the local API at:

http://localhost:11434

### 2. Run the chatbot

In a separate terminal, start the application:

```bash
node chat.js
```
### 3. Usage
Type a message and press Enter to chat

The model will respond using the local llama3 model

Conversation history is maintained during the session

### 4. Stopping the program
Press: Ctrl + C

npm install react-markdown remark-gfm