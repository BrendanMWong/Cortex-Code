const express = require("express");
const cors = require("cors");
const engine = require("./engine");

const app = express();

app.use(cors());
app.use(express.json());

// ===== SET ROOT =====
app.post("/set-root", (req, res) => {
    try {
        engine.setRoot(req.body.path);
        res.json({ ok: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// ===== CHAT =====
app.post("/chat", async (req, res) => {
    try {
        const result = await engine.runChat(req.body.message);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== EDIT (PROPOSE) =====
app.post("/edit", async (req, res) => {
    try {
        const result = await engine.runEditFlow(req.body.message);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== GET PENDING =====
app.get("/pending-edits", (req, res) => {
    res.json({ edits: engine.getPendingEdits() });
});

// ===== APPLY EDITS =====
app.post("/apply-edits", (req, res) => {
    try {
        const result = engine.applyEdits(req.body.edits);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== REJECT EDITS (NEW) =====
app.post("/reject-edits", (req, res) => {
    try {
        engine.clearPendingEdits();
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== START =====
app.listen(3001, () => {
    console.log("Server running on http://localhost:3001");
});