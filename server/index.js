import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import session from "express-session";
import multer from "multer";
import pdfParse from "pdf-parse";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import db from "./db.js";

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GROQ_API_KEY;
const DEFAULT_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
const MAX_MESSAGE_CHARS = Number(process.env.MAX_MESSAGE_CHARS || 12000);
const CHAT_PASSWORD = process.env.CHAT_PASSWORD || "kams2026";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "kams-secret-secure-key-2026",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 30 * 24 * 60 * 60 * 1000 }
  })
);

const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // Limite 5Mo

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Trop de demandes en peu de temps. Attends une minute puis réessaie." }
});

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// Middleware d'authentification par mot de passe
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.status(401).json({ error: "Non authentifié", needAuth: true });
}

// Routes d'authentification
app.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  if (password === CHAT_PASSWORD) {
    req.session.authenticated = true;
    return res.json({ success: true });
  }
  res.status(401).json({ error: "Mot de passe incorrect." });
});

app.get("/api/check-auth", (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.json({ authenticated: true });
  }
  res.json({ authenticated: false });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

function groqErrorMessage(status, body) {
  const message = body?.error?.message || body?.message || "Erreur inconnue du fournisseur IA.";
  if (status === 401) return "Clé API Groq invalide. Vérifie GROQ_API_KEY dans ton fichier .env.";
  if (status === 429) return "La limite gratuite de Groq a été atteinte. Attends le renouvellement ou essaie un autre modèle.";
  if (status === 400) return `Requête refusée par Groq : ${message}`;
  if (status >= 500) return "Le service Groq rencontre un problème temporaire. Réessaie dans quelques instants.";
  return message;
}

app.get("/api/health", requireAuth, (_req, res) => {
  res.json({ ok: true, provider: "Groq", configured: Boolean(API_KEY) });
});

app.get("/api/models", requireAuth, async (_req, res) => {
  if (!API_KEY) {
    return res.json({ models: [
      { id: "openai/gpt-oss-20b", name: "GPT OSS 20B", recommended: true },
      { id: "openai/gpt-oss-120b", name: "GPT OSS 120B" },
      { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant" }
    ], source: "fallback" });
  }
  try {
    const response = await fetch(`${GROQ_URL}/models`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    });
    if (!response.ok) throw new Error("Impossible de charger les modèles Groq.");
    const data = await response.json();
    const preferred = [
      "openai/gpt-oss-20b",
      "openai/gpt-oss-120b",
      "llama-3.1-8b-instant"
    ];
    const available = new Set((data.data || []).map(m => m.id));
    const models = preferred.filter(m => available.has(m)).map((modelId, index) => ({
      id: modelId,
      name: modelId === "openai/gpt-oss-20b" ? "GPT OSS 20B" :
        modelId === "openai/gpt-oss-120b" ? "GPT OSS 120B" : "Llama 3.1 8B Instant",
      recommended: index === 0
    }));
    res.json({ models: models.length ? models : preferred.map(id => ({ id, name: id })), source: "groq" });
  } catch {
    res.json({ models: [
      { id: DEFAULT_MODEL, name: DEFAULT_MODEL, recommended: true },
      { id: "openai/gpt-oss-120b", name: "GPT OSS 120B" }
    ], source: "fallback" });
  }
});

app.get("/api/chats", requireAuth, (_req, res) => {
  const chats = db.prepare(`
    SELECT c.id, c.title, c.model, c.created_at, c.updated_at,
      (SELECT content FROM messages m WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
    FROM chats c ORDER BY c.updated_at DESC
  `).all();
  res.json({ chats });
});

app.post("/api/chats", requireAuth, (req, res) => {
  const chatId = id();
  const timestamp = now();
  const model = typeof req.body?.model === "string" ? req.body.model : DEFAULT_MODEL;
  db.prepare("INSERT INTO chats (id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(chatId, "Nouvelle discussion", model, timestamp, timestamp);
  res.status(201).json({ chat: { id: chatId, title: "Nouvelle discussion", model, created_at: timestamp, updated_at: timestamp } });
});

app.get("/api/chats/:id/messages", requireAuth, (req, res) => {
  const chat = db.prepare("SELECT id FROM chats WHERE id = ?").get(req.params.id);
  if (!chat) return res.status(404).json({ error: "Discussion introuvable." });
  const messages = db.prepare("SELECT id, role, content, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC").all(req.params.id);
  res.json({ messages });
});

app.delete("/api/chats/:id", requireAuth, (req, res) => {
  const result = db.prepare("DELETE FROM chats WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Discussion introuvable." });
  res.json({ ok: true });
});

app.patch("/api/chats/:id", requireAuth, (req, res) => {
  const model = req.body?.model;
  if (typeof model !== "string" || model.length > 120) return res.status(400).json({ error: "Modèle invalide." });
  const result = db.prepare("UPDATE chats SET model = ?, updated_at = ? WHERE id = ?").run(model, now(), req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Discussion introuvable." });
  res.json({ ok: true });
});

// Fonction utilitaire Recherche Web (Tavily)
async function searchWeb(query) {
  if (!TAVILY_API_KEY) return "";
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: TAVILY_API_KEY, query, max_results: 3 })
    });
    const data = await response.json();
    if (data && data.results) {
      return data.results.map(r => `\n${r.content}`).join("\n\n");
    }
  } catch (e) {
    console.error("Erreur recherche web", e);
  }
  return "";
}

app.post("/api/chat", requireAuth, chatLimiter, upload.single("file"), async (req, res) => {
  if (!API_KEY || API_KEY === "colle_ta_cle_api_ici") {
    return res.status(503).json({ error: "Clé API absente. Ajoute ta clé Groq dans le fichier .env puis redémarre le serveur." });
  }

  const { chatId, message, model, useWebSearch } = req.body || {};
  let userText = message || "";

  // Gestion des fichiers joints (PDF ou Texte/Code)
  if (req.file) {
    try {
      if (req.file.mimetype === "application/pdf") {
        const pdfData = await pdfParse(req.file.buffer);
        userText += `\n\n[Contenu du fichier PDF joint (${req.file.originalname})] :\n${pdfData.text.substring(0, 15000)}`;
      } else {
        const fileContent = req.file.buffer.toString("utf8");
        userText += `\n\n[Contenu du fichier joint (${req.file.originalname})] :\n${fileContent.substring(0, 15000)}`;
      }
    } catch (err) {
      console.error("Erreur lecture fichier", err);
    }
  }

  if (typeof chatId !== "string" || typeof userText !== "string" || !userText.trim()) {
    return res.status(400).json({ error: "Discussion ou message manquant." });
  }
  if (userText.length > MAX_MESSAGE_CHARS) {
    return res.status(413).json({ error: `Ton message dépasse la limite de ${MAX_MESSAGE_CHARS} caractères.` });
  }

  const chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(chatId);
  if (!chat) return res.status(404).json({ error: "Discussion introuvable. Crée une nouvelle discussion." });

  let webContext = "";
  if (useWebSearch === "true" || useWebSearch === true) {
    webContext = await searchWeb(message);
  }

  const selectedModel = typeof model === "string" && model.length < 120 ? model : chat.model || DEFAULT_MODEL;
  const timestamp = now();
  const userMessageId = id();
  db.prepare("INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)")
    .run(userMessageId, chatId, userText.trim(), timestamp);

  const previous = db.prepare(`
    SELECT role, content FROM messages WHERE chat_id = ?
    ORDER BY created_at DESC LIMIT 24
  `).all(chatId).reverse();

  const title = chat.title === "Nouvelle discussion"
    ? userText.trim().replace(/\s+/g, " ").slice(0, 48) + (userText.trim().length > 48 ? "…" : "")
    : chat.title;

  try {
    let systemContent = "Tu es KAM'S AI CHAT, un assistant personnel utile, précis et chaleureux. Réponds dans la langue de l'utilisateur, principalement en français. Explique clairement, structure les réponses avec des titres et des listes quand cela aide. Pour les sujets techniques, donne des étapes concrètes et signale les incertitudes. N'invente jamais des informations.";
    if (webContext) {
      systemContent += `\n\nVoici des informations fraîches du Web pour t'aider à répondre :\n${webContext}`;
    }

    const response = await fetch(`${GROQ_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          {
            role: "system",
            content: systemContent
          },
          ...previous
        ],
        temperature: 0.7,
        max_completion_tokens: 2048
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(groqErrorMessage(response.status, data)), { status: response.status });
    }

    const answer = data.choices?.[0]?.message?.content;
    if (!answer) throw new Error("Groq a renvoyé une réponse vide. Essaie un autre modèle.");
    const assistantId = id();
    const answerTime = now();

    const save = db.transaction(() => {
      db.prepare("INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, 'assistant', ?, ?)")
        .run(assistantId, chatId, answer, answerTime);
      db.prepare("UPDATE chats SET title = ?, model = ?, updated_at = ? WHERE id = ?")
        .run(title, selectedModel, answerTime, chatId);
    });
    save();

    res.json({
      message: { id: assistantId, role: "assistant", content: answer, created_at: answerTime },
      usage: data.usage || null,
      model: data.model || selectedModel
    });
  } catch (error) {
    db.prepare("DELETE FROM messages WHERE id = ?").run(userMessageId);
    res.status(error.status || 502).json({ error: error.message || "Impossible de contacter Groq." });
  }
});

// En production, Express sert le frontend construit par Vite.
const distPath = path.resolve(__dirname, "../dist");
app.use(express.static(distPath));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(distPath, "index.html"), err => err && next(err));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`KAM'S AI CHAT démarré sur http://localhost:${PORT}`);
});
