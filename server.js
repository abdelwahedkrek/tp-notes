const express = require("express");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

const notes = [];

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/notes", (req, res) => res.json(notes));

app.post("/notes", (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text || text.length > 200) {
    return res.status(400).json({ error: "texte requis (1 à 200 caractères)" });
  }
  const note = { id: notes.length + 1, text };
  notes.push(note);
  res.status(201).json(note);
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`API notes sur http://localhost:${port}`));
}
module.exports = app;
