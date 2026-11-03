import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Activity, ArrowDown, ArrowUp, Bot, Check, ChevronDown, CircleHelp,
  Code2, Command, Copy, Ellipsis, FileText, Globe2, Menu, MessageSquare,
  MessageSquarePlus, MoreHorizontal, PanelLeftClose, PanelLeftOpen,
  Plus, Send, Settings2, Sparkles, Trash2, X, Zap
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
  const textareaRef = useRef(null);
  const bottomRef = useRef(null);

  const activeChat = chats.find(c => c.id === activeId);

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Une erreur est survenue.");
    return data;
  }

  async function refreshChats() {
    const data = await api("/chats");
    setChats(data.chats);
    return data.chats;
  }

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    let cancelled = false;
    api(`/chats/${activeId}/messages`)
      .then(data => { if (!cancelled) setMessages(data.messages || []); })
      .catch(err => showToast(err.message));
    return () => { cancelled = true; };
  }, [activeId]);

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
        method: "POST", body: JSON.stringify({ model })
      });
      setChats(prev => [data.chat, ...prev]);
      setActiveId(data.chat.id);
      setMessages([]);
      setInput("");
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
        await api(`/chats/${activeId}`, { method: "PATCH", body: JSON.stringify({ model: nextModel }) });
        setChats(prev => prev.map(c => c.id === activeId ? { ...c, model: nextModel } : c));
      } catch (err) { showToast(err.message); }
    }
  }

  async function sendMessage(value = input) {
    const text = value.trim();
    if (!text || sending) return;
    let chatId = activeId;
    try {
      if (!chatId) {
        const created = await api("/chats", { method: "POST", body: JSON.stringify({ model }) });
        chatId = created.chat.id;
        setChats(prev => [created.chat, ...prev]);
        setActiveId(chatId);
      }
      const optimistic = { id: `temp-${Date.now()}`, role: "user", content: text, created_at: new Date().toISOString() };
      setMessages(prev => [...prev, optimistic]);
      setInput("");
      setSending(true);
      const data = await api("/chat", {
        method: "POST",
        body: JSON.stringify({ chatId, message: text, model })
      });
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

  const currentModelName = models.find(m => m.id === model)?.name || model;

  return (
    <div className="app-shell">
      {mobileMenu && <button className="mobile-scrim" onClick={() => setMobileMenu(false)} aria-label="Fermer le menu" />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : "sidebar-closed"} ${mobileMenu ? "sidebar-mobile-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark"><Sparkles size={19} strokeWidth={2.2}/></div>
          {sidebarOpen && <div className="brand-copy"><span>KAM'S <b>AI</b></span><small>CHAT STUDIO</small></div>}
          <button className="icon-button sidebar-collapse" onClick={() => setSidebarOpen(!sidebarOpen)} title="Réduire le menu">
            {sidebarOpen ? <PanelLeftClose size={18}/> : <PanelLeftOpen size={18}/>}
          </button>
        </div>

        <button className={`new-chat-button ${!sidebarOpen ? "new-chat-compact" : ""}`} onClick={newChat}>
          <Plus size={18}/>{sidebarOpen && <span>Nouvelle discussion</span>}
          {sidebarOpen && <kbd>⌘ K</kbd>}
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
          <div className="provider-card">
            <div className="provider-icon"><Zap size={15}/></div>
            {sidebarOpen && <div className="provider-info"><b>Propulsé par Groq</b><span>IA rapide · API</span></div>}
            {sidebarOpen && <span className={`status-dot status-${apiStatus}`} title={apiStatus}/>}
          </div>
          <button className="sidebar-link" onClick={() => setShowSettings(true)}>
            <Settings2 size={17}/>{sidebarOpen && <span>Paramètres</span>}
          </button>
          {sidebarOpen && <div className="sidebar-footnote">Un espace personnel pour penser plus loin.</div>}
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu-button" onClick={() => setMobileMenu(true)}><Menu size={19}/></button>
            <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><b>{activeChat?.title || "Nouvelle discussion"}</b></div>
          </div>
          <div className="topbar-actions">
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
            <div className="topbar-divider"/>
            <div className="connection-label"><span className={`status-dot status-${apiStatus}`}/><span>{apiStatus === "online" ? "En ligne" : apiStatus === "missing" ? "Clé API requise" : apiStatus === "offline" ? "Hors ligne" : "Connexion…"}</span></div>
          </div>
        </header>

        <section className={`conversation ${messages.length === 0 ? "conversation-empty" : ""}`}>
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-orbit orbit-one"/><div className="welcome-orbit orbit-two"/>
              <div className="welcome-icon"><div><Sparkles size={28}/></div><span className="welcome-glow"/></div>
              <div className="eyebrow"><span className="eyebrow-line"/> TON ASSISTANT, TON ESPACE <span className="eyebrow-line"/></div>
              <h1>Les idées prennent<br/><em>vie ici.</em></h1>
              <p className="welcome-subtitle">Bienvenue sur KAM'S AI CHAT. Pose une question, explore une idée ou construis quelque chose de grand.</p>
              <div className="prompt-grid">
                {starterPrompts.map(({ icon: Icon, title, text }) => <button key={title} className="prompt-card" onClick={() => sendMessage(text)}>
                  <span className="prompt-icon"><Icon size={18}/></span><b>{title}</b><span>{text}</span><ArrowUp size={15} className="prompt-arrow"/>
                </button>)}
              </div>
              {apiStatus === "missing" && <div className="setup-hint"><CircleHelp size={16}/> Ajoute ta clé Groq dans le fichier <code>.env</code> pour commencer.</div>}
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
                  {message.role === "assistant" && <div className="message-tools">
                    <button onClick={() => copyMessage(message)}>{copiedId === message.id ? <Check size={14}/> : <Copy size={14}/>} {copiedId === message.id ? "Copié" : "Copier"}</button>
                  </div>}
                </div>
              </article>)}
              {sending && <article className="message-row message-assistant"><div className="assistant-avatar"><Sparkles size={16}/></div><div className="message-content"><div className="message-meta"><b>KAM'S AI</b><span>Réfléchit…</span></div><div className="typing-indicator"><i/><i/><i/></div></div></article>}
              <div ref={bottomRef}/>
            </div>
          )}
        </section>

        <footer className="composer-area">
          <div className="composer">
            <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onInputKeyDown} placeholder="Écris ton message à KAM'S AI…" rows={1} disabled={sending}/>
            <div className="composer-bottom">
              <div className="composer-hints"><span><kbd>Entrée</kbd> envoyer</span><span><kbd>Maj + Entrée</kbd> nouvelle ligne</span></div>
              <button className={`send-button ${input.trim() && !sending ? "send-ready" : ""}`} onClick={() => sendMessage()} disabled={!input.trim() || sending} aria-label="Envoyer le message">
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
          <div className="settings-row"><div className="settings-symbol"><Zap size={17}/></div><div><b>Fournisseur IA</b><span>GroqCloud API</span></div><span className={`settings-status ${apiStatus}`}>{apiStatus === "online" ? "Connecté" : apiStatus === "missing" ? "Clé manquante" : "À vérifier"}</span></div>
          <div className="settings-row"><div className="settings-symbol"><Bot size={17}/></div><div><b>Modèle actif</b><span>{currentModelName}</span></div></div>
          <div className="settings-note">Les conversations sont conservées dans la base de données du serveur. Cette version ne comporte pas de connexion : toute personne qui connaît l'adresse du site peut potentiellement l'utiliser.</div>
          <button className="modal-done" onClick={() => setShowSettings(false)}>Terminé</button>
        </div>
      </div>}

      {toast && <div className="toast"><Activity size={16}/>{toast}<button onClick={() => setToast("")}><X size={14}/></button></div>}
    </div>
  );
}