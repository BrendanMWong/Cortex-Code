const express = require("express");
const cors = require("cors");
const engine = require("./engine");

const app = express();

app.use(cors());
app.use(express.json());

// ===== SET ROOT =====
app.post("/set-root", (req, res) => {
    try {
        const { path } = req.body;
        engine.setRoot(path);
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// ===== CHAT =====
app.post("/chat", async (req, res) => {
    try {
        const { message } = req.body;
        const result = await engine.runChat(message);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== EDIT =====
app.post("/edit", async (req, res) => {
    try {
        const { message } = req.body;
        const result = await engine.runEditFlow(message);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== START =====
app.listen(3001, () => {
    console.log("Server running on http://localhost:3001");
});