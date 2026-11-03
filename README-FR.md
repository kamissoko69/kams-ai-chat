# KAM'S AI CHAT — Guide complet

Application de chat IA personnelle avec React, Vite, Node.js, Express, SQLite et l'API Groq.

## 1. Ce qu'il faut installer

- Node.js LTS (version 20 ou supérieure) : https://nodejs.org/
- Visual Studio Code : https://code.visualstudio.com/
- Un compte Groq : https://console.groq.com/

## 2. Créer la clé API Groq

1. Ouvre https://console.groq.com/
2. Crée un compte ou connecte-toi.
3. Va dans **API Keys** : https://console.groq.com/keys
4. Clique sur **Create API Key**.
5. Donne-lui un nom, par exemple `kams-ai-chat`.
6. Copie la clé immédiatement et garde-la privée. Tu ne pourras pas forcément la revoir ensuite.
7. Ne colle jamais cette clé dans un fichier React, dans GitHub ou dans une capture d'écran.

Documentation officielle :
- Quickstart : https://console.groq.com/docs/quickstart
- Modèles disponibles : https://console.groq.com/docs/models
- Limites de requêtes : https://console.groq.com/docs/rate-limits
- API Chat Completions : https://console.groq.com/docs/api-reference

## 3. Installer le projet sur Windows

1. Décompresse `kams-ai-chat.zip`.
2. Déplace le dossier `kams-ai-chat` dans un emplacement simple, par exemple `C:\Users\TON_NOM\Documents\kams-ai-chat`.
3. Ouvre le dossier dans VS Code.
4. Dans VS Code : **Terminal > New Terminal**.
5. Vérifie Node :
   ```powershell
   node -v
   npm -v
   ```
6. Installe les dépendances :
   ```powershell
   npm install
   ```

## 4. Configurer la clé API

À la racine du projet, tu trouveras `.env.example`.

1. Fais une copie de ce fichier.
2. Renomme la copie en `.env` (exactement `.env`, pas `.env.txt`).
3. Ouvre `.env`.
4. Remplace la valeur après `GROQ_API_KEY=` par ta clé.

Exemple :
```env
GROQ_API_KEY=gsk_ta_cle_secrete_ici
GROQ_MODEL=openai/gpt-oss-20b
PORT=3000
DATABASE_PATH=./data/kams-chat.db
MAX_MESSAGE_CHARS=12000
```

Ne mets pas de guillemets autour de la clé. Ne partage jamais le fichier `.env`.

## 5. Démarrer KAM'S AI CHAT

Dans le terminal, à la racine du projet :

```powershell
npm run dev
```

- Frontend : http://localhost:5173
- Backend : http://localhost:3000
- Vérification : http://localhost:3000/api/health

Pour arrêter : `Ctrl + C`.

Si PowerShell bloque `npm.ps1`, utilise le terminal **Command Prompt (cmd)** dans VS Code, ou lance :
```powershell
npm.cmd run dev
```

## 6. Quel modèle choisir ?

Le projet propose une liste de modèles Groq connue et vérifie leur présence avec l'API `/models`. Le modèle par défaut est :

`openai/gpt-oss-20b`

Tu peux modifier le modèle par défaut dans `.env` :
```env
GROQ_MODEL=openai/gpt-oss-20b
```

Tu peux aussi choisir un modèle dans le menu en haut de l'application. La liste de modèles évolue : vérifie les modèles actifs sur https://console.groq.com/docs/models.

Les quotas gratuits ne sont pas illimités. Ils varient selon le modèle et le compte. Consulte https://console.groq.com/settings/limits ou la page officielle des rate limits. Une réponse HTTP 429 signifie généralement qu'une limite a été atteinte.

## 7. Où modifier le site ?

| Fichier | Rôle |
|---|---|
| `src/App.jsx` | Structure de l'interface, boutons, historique et logique du chat |
| `src/styles.css` | Design complet, couleurs, tailles, responsive mobile |
| `server/index.js` | Connexion Groq, routes API, règles et prompt système |
| `server/db.js` | Base de données et tables SQLite |
| `.env` | Clé API, modèle par défaut, port et chemin de base de données |
| `package.json` | Dépendances et commandes |

### Modifier le nom du modèle affiché
Dans `server/index.js`, cherche `app.get("/api/models"` et modifie les libellés si nécessaire. Les IDs doivent correspondre à de vrais modèles actifs chez Groq.

### Modifier la personnalité de l'assistant
Dans `server/index.js`, cherche `Tu es KAM'S AI CHAT`. Remplace le texte du message `system` pour changer le ton, la langue ou le comportement.

### Modifier les couleurs
Dans `src/styles.css`, au début du fichier, modifie les variables CSS sous `:root`, notamment `--bg`, `--accent` et `--accent2`.

## 8. Comment publier le site sur Render

**Important :** cette version n'a pas d'authentification, comme demandé. Si tu publies l'application sur Internet, toute personne qui connaît ou trouve l'adresse pourra envoyer des messages et consommer ton quota Groq. Ne mets pas de données sensibles dedans. Pour un usage réellement privé, il faudra ajouter une protection plus tard.

1. Crée un compte GitHub : https://github.com/
2. Crée un nouveau dépôt privé, par exemple `kams-ai-chat`.
3. Dans VS Code, ouvre un terminal à la racine du projet :
   ```powershell
   git init
   git add .
   git commit -m "Initial Kams AI Chat"
   git branch -M main
   git remote add origin https://github.com/TON-COMPTE/kams-ai-chat.git
   git push -u origin main
   ```
4. Vérifie que `.env` n'a PAS été envoyé. Le fichier est ignoré par `.gitignore`.
5. Crée un compte Render : https://render.com/
6. Choisis **New + > Web Service**.
7. Connecte GitHub et sélectionne `kams-ai-chat`.
8. Paramètres :
   - Runtime : Node
   - Build Command : `npm install && npm run build`
   - Start Command : `npm start`
9. Dans **Environment**, ajoute :
   - `GROQ_API_KEY` = ta clé Groq
   - `GROQ_MODEL` = `openai/gpt-oss-20b`
   - `DATABASE_PATH` = `/var/data/kams-chat.db`
10. Pour conserver les conversations après redémarrage, ajoute un **Persistent Disk** Render monté sur `/var/data`.
11. Déploie le service.

### À propos des coûts Render
L'hébergement gratuit peut s'endormir et son système de fichiers local peut être éphémère. Un disque persistant peut nécessiter une formule payante. Vérifie les prix et limites actuels de Render avant de choisir. L'API Groq a ses propres quotas séparés de l'hébergement.

## 9. Sécurité et limites

- La clé API est utilisée uniquement dans le backend Express.
- `.env` est exclu de Git par `.gitignore`.
- Le backend applique une limite de requêtes locale pour éviter les envois trop rapides.
- Le serveur conserve les conversations dans SQLite.
- Le backend renvoie les 24 derniers messages au modèle pour maintenir le contexte.
- Cette première version n'a volontairement aucune authentification.
- La base SQLite locale est stockée dans `data/`, dossier ignoré par Git.
- Sur Render, configure un disque persistant si tu veux conserver la base après redéploiement.
- Une erreur 429 indique que le quota du fournisseur ou une limite de débit a été atteint.
- Les modèles et leurs quotas peuvent changer : consulte les pages officielles Groq.

## 10. Commandes utiles

```powershell
npm run dev       # développement
npm run build     # construire le frontend
npm start         # lancer en production
```

Bon développement avec KAM'S AI CHAT !