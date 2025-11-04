# 🧠 AI Code Debugger

An AI-powered code debugging tool built with **Node.js (Express)** and **React**, using modern LLMs (Groq / OpenAI) to analyze, detect, and suggest fixes for coding issues.  
Supports multiple programming languages and provides line-based fixes, explanations, and test suggestions — all in one sleek interface.

---

## Features

- **AI Debugging:** Automatically detects syntax, logic, and dependency issues.
- **Fix Suggestions:** One-click apply or copy for each suggested fix.
- **Test Generation:** AI suggests small tests to verify code correctness.
- **Error Trace Input:** Paste your stack trace for deeper debugging context.
- **Modern UI:** Monaco editor + responsive, card-based layout.
- **Environment-Safe:** `.env` excluded from Git, `.env.example` included.

---

## Tech Stack

| Area | Technology |
|------|-------------|
| Frontend | React + Monaco Editor |
| Backend | Node.js + Express |
| AI Models | Groq Compund|
| Styling | Custom CSS (light theme) |
| Communication | REST API (`/api/debug`) |
| Editor | [@monaco-editor/react](https://www.npmjs.com/package/@monaco-editor/react) |

---

## Setup Instructions

### 1️⃣ Clone the repository
```bash
git clone https://github.com/devdansty/AI-Code-Debugger-.git
cd AI-Code-Debugger-
uncomment the .env.eample fileand copy it into .env and just change it with your grok api key 
