import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Activity, ArrowUp, Bot, Check, ChevronDown, CircleHelp,
  Code2, Copy, Download, FileText, Globe, Globe2, Lock, Menu, MessageSquare,
  Paperclip, Plus, Send, Settings2, Sparkles, Trash2, Volume2, X, Zap
} from "lucide-react";

const API = "/api";
const starterPrompts = [
  { icon: Code2, title: "M'aider à coder", text: "Aide-moi à créer une application web moderne avec React et Node.js." },
  { icon: Globe2, title: "Explorer le Cloud", text: "Explique-moi comment déployer une application sur AWS EC2 avec Docker." },
  { icon: FileText, title: "Rédiger un texte", text: "Aide-moi à rédiger un texte professionnel clair et convaincant." },
  { icon: Sparkles, title: "Comprendre un sujet", text: "Explique-moi un sujet complexe simplement, avec des exemples concrets." }
];

function timeLabel(date) {
  if (!date) return "";
  return new Date(date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");

  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("openai/gpt-oss-20b");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modelMenu, setModelMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [apiStatus, setApiStatus] = useState("checking");
  const [showSettings, setShowSettings] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const [useWebSearch, setUseWebSearch] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const bottomRef = useRef(null);

  const activeChat = chats.find(c => c.id === activeId);

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      headers: { ...(options.headers || {}) },
      credentials: "include",
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && data.needAuth) {
      setIsAuthenticated(false);
      throw new Error("Session expirée ou non authentifiée.");
    }
    if (!response.ok) throw new Error(data.error || "Une erreur est survenue.");
    return data;
  }

  async function checkAuth() {
    try {
      const data = await api("/check-auth");
      if (data.authenticated) {
        setIsAuthenticated(true);
      }
    } catch {
      setIsAuthenticated(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    try {
      const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsAuthenticated(true);
        setAuthError("");
        setPasswordInput("");
        initApp();
      } else {
        setAuthError(data.error || "Mot de passe incorrect.");
      }
    } catch {
      setAuthError("Erreur de connexion au serveur.");
    }
  }

  async function refreshChats() {
    const data = await api("/chats");
    setChats(data.chats);
    return data.chats;
  }

  async function initApp() {
    try {
      const [health, modelData, chatData] = await Promise.all([
        api("/health"), api("/models"), api("/chats")
      ]);
      setApiStatus(health.configured ? "online" : "missing");
      setModels(modelData.models || []);
      setChats(chatData.chats || []);
      if (modelData.models?.length) {
        const chosen = modelData.models.find(m => m.recommended) || modelData.models[0];
        setModel(chosen.id);
      }
      if (chatData.chats?.length) setActiveId(chatData.chats[0].id);
    } catch {
      setApiStatus("offline");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await checkAuth();
      try {
        const data = await api("/check-auth");
        if (data.authenticated) {
          await initApp();
        } else {
          setLoading(false);
        }
      } catch {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeId || !isAuthenticated) { setMessages([]); return; }
    let cancelled = false;
    api(`/chats/${activeId}/messages`)
      .then(data => { if (!cancelled) setMessages(data.messages || []); })
      .catch(err => showToast(err.message));
    return () => { cancelled = true; };
  }, [activeId, isAuthenticated]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  function showToast(message) {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(""), 4200);
  }

  async function newChat() {
    try {
      const data = await api("/chats", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model })
      });
      setChats(prev => [data.chat, ...prev]);
      setActiveId(data.chat.id);
      setMessages([]);
      setInput(id => id);
      setSelectedFile(null);
      setMobileMenu(false);
      textareaRef.current?.focus();
    } catch (err) { showToast(err.message); }
  }

  async function selectChat(chat) {
    setActiveId(chat.id);
    setModel(chat.model || model);
    setMobileMenu(false);
  }

  async function deleteChat(event, chatId) {
    event.stopPropagation();
    try {
      await api(`/chats/${chatId}`, { method: "DELETE" });
      const remaining = chats.filter(c => c.id !== chatId);
      setChats(remaining);
      if (activeId === chatId) {
        setActiveId(remaining[0]?.id || null);
        if (!remaining.length) setMessages([]);
      }
      showToast("Discussion supprimée.");
    } catch (err) { showToast(err.message); }
  }

  async function chooseModel(nextModel) {
    setModel(nextModel);
    setModelMenu(false);
    if (activeId) {
      try {
        await api(`/chats/${activeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: nextModel }) });
        setChats(prev => prev.map(c => c.id === activeId ? { ...c, model: nextModel } : c));
      } catch (err) { showToast(err.message); }
    }
  }

  async function sendMessage(value = input) {
    const text = value.trim();
    if ((!text && !selectedFile) || sending) return;
    let chatId = activeId;
    try {
      if (!chatId) {
        const created = await api("/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }) });
        chatId = created.chat.id;
        setChats(prev => [created.chat, ...prev]);
        setActiveId(chatId);
      }
      
      const fileDisplay = selectedFile ? ` 📎 [Fichier: ${selectedFile.name}]` : "";
      const optimistic = { id: `temp-${Date.now()}`, role: "user", content: text + fileDisplay, created_at: new Date().toISOString() };
      setMessages(prev => [...prev, optimistic]);
      setInput("");
      const fileToSend = selectedFile;
      setSelectedFile(null);
      setSending(true);

      const formData = new FormData();
      formData.append("chatId", chatId);
      formData.append("message", text);
      formData.append("model", model);
      formData.append("useWebSearch", useWebSearch);
      if (fileToSend) formData.append("file", fileToSend);

      const response = await fetch(`${API}/chat`, {
        method: "POST",
        body: formData,
        credentials: "include"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Une erreur est survenue.");

      setMessages(prev => [...prev.filter(m => !String(m.id).startsWith("temp-")), optimistic, data.message]);
      await refreshChats();
    } catch (err) {
      setMessages(prev => prev.filter(m => !String(m.id).startsWith("temp-")));
      setInput(text);
      showToast(err.message);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function onInputKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  async function copyMessage(message) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch { showToast("Impossible de copier ce message."); }
  }

  function speakText(text) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'fr-FR';
      window.speechSynthesis.speak(utterance);
    } else {
      showToast("La synthèse vocale n'est pas supportée par votre navigateur.");
    }
  }

  function exportConversation() {
    const textContent = messages.map(m => `${m.role === 'assistant' ? "KAM'S AI" : "VOUS"}:\n${m.content}\n\n`).join("---\n");
    const blob = new Blob([textContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kams-chat-${Date.now()}.md`;
    a.click();
  }

  const currentModelName = models.find(m => m.id === model)?.name || model;

  if (loading) {
    return <div className="app-shell" style={{ display: "flex", justifyContent: "center", alignItems: "center", color: "#8c96b2" }}>Chargement de KAM'S AI CHAT...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="login-container" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: "#090b12" }}>
        <form className="login-box" onSubmit={handleLogin} style={{ backgroundColor: "#0f131f", border: "1px solid #212a42", padding: "32px", borderRadius: "16px", width: "100%", maxWidth: "400px", textAlign: "center", color: "#f1f3f9" }}>
          <div style={{ width: "48px", height: "48px", margin: "0 auto 16px", borderRadius: "12px", background: "linear-gradient(135deg, #6366f1, #ec4899)", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
            <Lock size={22} />
          </div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "8px" }}>KAM'S AI CHAT</h2>
          <p style={{ color: "#8c96b2", fontSize: "0.9rem", marginBottom: "20px" }}>Espace sécurisé. Entrez votre mot de passe personnel.</p>
          <input
            type="password"
            placeholder="Mot de passe..."
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            style={{ width: "100%", padding: "12px", backgroundColor: "#141927", border: "1px solid #212a42", borderRadius: "8px", color: "#f1f3f9", fontSize: "1rem", marginBottom: "12px", outline: "none" }}
            autoFocus
          />
          {authError && <div style={{ color: "#ef4444", fontSize: "0.85rem", marginBottom: "12px" }}>{authError}</div>}
          <button type="submit" style={{ width: "100%", padding: "12px", background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "white", border: "none", borderRadius: "8px", fontWeight: "600", cursor: "pointer" }}>Déverrouiller</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {mobileMenu && <button className="mobile-scrim" onClick={() => setMobileMenu(false)} aria-label="Fermer le menu" />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : "sidebar-closed"} ${mobileMenu ? "sidebar-mobile-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark"><Sparkles size={19} strokeWidth={2.2}/></div>
          {sidebarOpen && <div className="brand-copy"><span>KAM'S <b>AI</b></span><small>CHAT STUDIO</small></div>}
          <button className="icon-button sidebar-collapse" onClick={() => setSidebarOpen(!sidebarOpen)} title="Réduire le menu">
            {sidebarOpen ? <span/> : <span/>}
          </button>
        </div>

        <button className={`new-chat-button ${!sidebarOpen ? "new-chat-compact" : ""}`} onClick={newChat}>
          <Plus size={18}/>{sidebarOpen && <span>Nouvelle discussion</span>}
        </button>

        {sidebarOpen && <div className="sidebar-section-label">ESPACE DE TRAVAIL</div>}
        <nav className="chat-list">
          {sidebarOpen && chats.length > 0 && <div className="list-heading">Récents</div>}
          {chats.map(chat => (
            <button key={chat.id} className={`chat-item ${activeId === chat.id ? "chat-item-active" : ""}`} onClick={() => selectChat(chat)} title={chat.title}>
              <MessageSquare size={16}/>
              {sidebarOpen && <><span className="chat-item-title">{chat.title}</span><span className="chat-delete" onClick={e => deleteChat(e, chat.id)} title="Supprimer"><Trash2 size={14}/></span></>}
            </button>
          ))}
          {sidebarOpen && chats.length === 0 && !loading && <div className="empty-history">Tes discussions apparaîtront ici.</div>}
        </nav>

        <div className="sidebar-bottom">
          {sidebarOpen && messages.length > 0 && (
            <button onClick={exportConversation} style={{ width: "100%", background: "#141927", border: "1px solid #212a42", color: "#f1f3f9", padding: "8px", borderRadius: "8px", fontSize: "0.8rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "8px" }}>
              <Download size={14}/> Exporter la discussion
            </button>
          )}
          <div className="provider-card">
            <div className="provider-icon"><Zap size={15}/></div>
            {sidebarOpen && <div className="provider-info"><b>Propulsé par Groq</b><span>IA rapide · API</span></div>}
            {sidebarOpen && <span className={`status-dot status-${apiStatus}`} title={apiStatus}/>}
          </div>
          <button className="sidebar-link" onClick={() => setShowSettings(true)}>
            <Settings2 size={17}/>{sidebarOpen && <span>Paramètres</span>}
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu-button" onClick={() => setMobileMenu(true)}><Menu size={19}/></button>
            <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><b>{activeChat?.title || "Nouvelle discussion"}</b></div>
          </div>
          <div className="topbar-actions">
            <button
              onClick={() => setUseWebSearch(!useWebSearch)}
              style={{ display: "flex", alignItems: "center", gap: "6px", backgroundColor: useWebSearch ? "rgba(99, 102, 241, 0.15)" : "#141927", border: `1px solid ${useWebSearch ? "#6366f1" : "#212a42"}`, color: useWebSearch ? "#f1f3f9" : "#8c96b2", padding: "6px 12px", borderRadius: "8px", fontSize: "0.85rem", cursor: "pointer", marginRight: "8px" }}
              title="Activer la recherche Web en direct"
            >
              <Globe size={15}/>
              <span>Recherche Web</span>
            </button>

            <div className="model-picker-wrap">
              <button className="model-picker" onClick={() => setModelMenu(!modelMenu)}>
                <span className="model-spark"><Sparkles size={14}/></span>
                <span>{currentModelName}</span><ChevronDown size={14}/>
              </button>
              {modelMenu && <div className="model-menu">
                <div className="model-menu-title">CHOISIR UN MODÈLE</div>
                {models.map(m => <button key={m.id} className={`model-option ${model === m.id ? "model-option-active" : ""}`} onClick={() => chooseModel(m.id)}>
                  <span className="model-option-icon"><Bot size={16}/></span>
                  <span><b>{m.name}</b><small>{m.id}</small></span>
                  {model === m.id && <Check size={16}/>}
                </button>)}
                {!models.length && <p className="model-empty">Configure la clé API Groq pour charger les modèles.</p>}
              </div>}
            </div>
          </div>
        </header>

        <section className={`conversation ${messages.length === 0 ? "conversation-empty" : ""}`}>
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-orbit orbit-one"/><div className="welcome-orbit orbit-two"/>
              <div className="welcome-icon"><div><Sparkles size={28}/></div><span className="welcome-glow"/></div>
              <div className="eyebrow"><span className="eyebrow-line"/> TON ASSISTANT, TON ESPACE <span className="eyebrow-line"/></div>
              <h1>Les idées prennent<br/><em>vie ici.</em></h1>
              <p className="welcome-subtitle">Bienvenue sur KAM'S AI CHAT. Pose une question, recherche sur le web ou analyse des documents.</p>
              <div className="prompt-grid">
                {starterPrompts.map(({ icon: Icon, title, text }) => <button key={title} className="prompt-card" onClick={() => sendMessage(text)}>
                  <span className="prompt-icon"><Icon size={18}/></span><b>{title}</b><span>{text}</span><ArrowUp size={15} className="prompt-arrow"/>
                </button>)}
              </div>
            </div>
          ) : (
            <div className="messages-wrap">
              <div className="conversation-date"><span/> DÉBUT DE LA CONVERSATION <span/></div>
              {messages.map((message, index) => <article key={message.id || index} className={`message-row message-${message.role}`}>
                {message.role === "assistant" ? <div className="assistant-avatar"><Sparkles size={16}/></div> : <div className="user-avatar">A</div>}
                <div className="message-content">
                  <div className="message-meta"><b>{message.role === "assistant" ? "KAM'S AI" : "VOUS"}</b><span>{timeLabel(message.created_at)}</span></div>
                  <div className="markdown-body">
                    {message.role === "assistant"
                      ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                      : <p>{message.content}</p>}
                  </div>
                  {message.role === "assistant" && <div className="message-tools" style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                    <button onClick={() => copyMessage(message)} style={{ background: "#090b12", border: "1px solid #212a42", color: "#8c96b2", padding: "4px 8px", borderRadius: "6px", fontSize: "0.75rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                      {copiedId === message.id ? <Check size={14}/> : <Copy size={14}/>} {copiedId === message.id ? "Copié" : "Copier"}
                    </button>
                    <button onClick={() => speakText(message.content)} style={{ background: "#090b12", border: "1px solid #212a42", color: "#8c96b2", padding: "4px 8px", borderRadius: "6px", fontSize: "0.75rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                      <Volume2 size={14}/> Écouter
                    </button>
                  </div>}
                </div>
              </article>)}
              {sending && <article className="message-row message-assistant"><div className="assistant-avatar"><Sparkles size={16}/></div><div className="message-content"><div className="message-meta"><b>KAM'S AI</b><span>Réfléchit…</span></div><div className="typing-indicator"><i/><i/><i/></div></div></article>}
              <div ref={bottomRef}/>
            </div>
          )}
        </section>

        <footer className="composer-area">
          {selectedFile && (
            <div style={{ maxWidth: "800px", margin: "0 auto 8px auto", backgroundColor: "#141927", border: "1px solid #212a42", padding: "6px 12px", borderRadius: "8px", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "#f1f3f9" }}>
              <Paperclip size={14}/>
              <span>{selectedFile.name}</span>
              <button onClick={() => setSelectedFile(null)} style={{ background: "none", border: "none", color: "#8c96b2", cursor: "pointer", marginLeft: "auto" }}><X size={14}/></button>
            </div>
          )}
          <div className="composer">
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={(e) => setSelectedFile(e.target.files[0])}
              accept=".pdf,.txt,.js,.py,.json,.md,.html,.css"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ background: "none", border: "none", color: "#8c96b2", cursor: "pointer", padding: "8px", display: "flex", alignItems: "center" }}
              title="Joindre un fichier (PDF, Code, Texte)"
            >
              <Paperclip size={18}/>
            </button>
            <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onInputKeyDown} placeholder="Écris ton message à KAM'S AI…" rows={1} disabled={sending}/>
            <div className="composer-bottom">
              <div className="composer-hints"><span><kbd>Entrée</kbd> envoyer</span></div>
              <button className={`send-button ${(input.trim() || selectedFile) && !sending ? "send-ready" : ""}`} onClick={() => sendMessage()} disabled={(!input.trim() && !selectedFile) || sending} aria-label="Envoyer le message">
                {sending ? <span className="send-spinner"/> : <Send size={17}/>}
              </button>
            </div>
          </div>
          <div className="disclaimer">KAM'S AI peut faire des erreurs. Vérifie les informations importantes.</div>
        </footer>
      </main>

      {showSettings && <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
        <div className="settings-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-head"><div><span className="modal-kicker">ESPACE PERSONNEL</span><h2>Paramètres</h2></div><button className="icon-button" onClick={() => setShowSettings(false)}><X size={19}/></button></div>
          <div className="settings-row"><div className="settings-symbol"><Zap size={17}/></div><div><b>Fournisseur IA</b><span>GroqCloud API</span></div><span className={`settings-status ${apiStatus}`}>{apiStatus === "online" ? "Connecté" : "À vérifier"}</span></div>
          <div className="settings-row"><div className="settings-symbol"><Bot size={17}/></div><div><b>Modèle actif</b><span>{currentModelName}</span></div></div>
          <div className="settings-note">Votre site est protégé par un mot de passe personnel et connecté à l'API Groq.</div>
          <button className="modal-done" onClick={() => setShowSettings(false)}>Terminé</button>
        </div>
      </div>}

      {toast && <div className="toast"><Activity size={16}/>{toast}<button onClick={() => setToast("")}><X size={14}/></button></div>}
    </div>
  );
}
