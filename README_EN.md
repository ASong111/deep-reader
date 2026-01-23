# Deep Reader

<p align="center">
  <img src="src-tauri/icons/128x128.png" width="128" height="128" alt="Deep Reader Logo">
</p>

<p align="center">
  <strong>Bring reading back to its essence. Your knowledge, truly yours.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Early%20Alpha-orange" alt="Status">
  <img src="https://img.shields.io/badge/License-GPL%20v3-blue" alt="License">
  <img src="https://img.shields.io/badge/Feedback-Welcome-brightgreen" alt="Feedback Welcome">
</p>

<p align="center">
  <a href="README.md">简体中文</a> | <strong>English</strong>
</p>

<p align="center">
  🌐 <a href="https://deep-reader-page.vercel.app/">Official Website</a>
</p>

---

## 💭 Our Philosophy

In this age of information overload, we believe:

**Reading should not be interrupted**
No ads, no recommendation algorithms, no social distractions. Just you and the text, focused on thinking itself.

**Maintain your flow state**
True deep reading requires flow state. AI is always passively triggered, never actively interrupting. It only appears when you need it.

**Your data should belong to you**
Your notes, your highlights, your thoughts—these are your private property. They should be stored on your device, encrypted with keys you control, not sitting on some company's server.

**Tools should adapt to people, not the other way around**
Why are e-book chapters always so fragmented? Why do copyright pages, tables of contents, and prefaces each occupy a separate chapter? We believe technology should be smarter, making chapter structures align with human reading habits.

**AI should be an assistant, not a master**
AI can help you summarize, think, and expand knowledge, but it's always just a tool. Your thinking process and knowledge system remain under your control.

---

## 🚧 Development Status

**Deep Reader is currently in early development stage (Early Alpha)**

This means:
- ✅ Core features are functional (reading, notes, AI assistant)
- ⚠️ There may be bugs and instability
- 🔄 Features and UI are continuously iterating
- 📝 Documentation is still incomplete

**We need your help!**

If you share our philosophy, if you're also looking for a reading tool that truly respects users, we sincerely invite you to:

1. **Try and provide feedback**: Tell us what works well and what doesn't
2. **Share suggestions**: What features would you like to see? What are your reading habits?
3. **Report issues**: Encountered a bug? Please tell us in [Issues](https://github.com/ASong111/deep-reader/issues)
4. **Contribute code**: If you're technical, contributions are welcome

We promise to:
- Take every piece of feedback seriously
- Keep the project open source and transparent
- Always uphold the principle of "local-first, privacy-first"

---

## ✨ Core Features

### 📖 Focused Reading Experience

- **Multi-format support**: EPUB, PDF, TXT, Markdown, HTML—all supported
- **Smart chapter organization**: Automatically identifies and merges copyright pages, tables of contents, prefaces, etc., making chapter structure more reasonable
- **Immersive interface**: Carefully designed typography, `F11` fullscreen mode, eliminating all distractions
- **Quick annotations**: Highlight and annotate directly while reading, without interrupting your flow

### 🔒 Your Data, Your Control

- **Fully local**: All data stored on your device, no uploads to any server
- **AES-256 encryption**: Note content protected with military-grade encryption
- **No tracking, no ads**: We don't collect any of your behavioral data

### 📝 Flexible Knowledge Management

- **Free organization**: Build your own knowledge system with categories and tags
- **Fast search**: Full-text search to instantly find what you need
- **Safe deletion**: Recycle bin mechanism, no worries about accidental deletion

### 🤖 AI Assistant (Optional)

- **Multi-model support**: Choose from OpenAI, Claude, or Gemini
- **Smart assistance**: Summarize, generate study questions, expand knowledge
- **Privacy protection**: API keys stored locally, you can delete them anytime

---

## 🚀 Quick Start

### Download

**Windows Users**:
- 📥 [Download Windows Installer](https://deep-reader-page.vercel.app/DeepReader-Setup.exe)

> 💡 **Note**: macOS and Linux versions coming soon. Please run from source for now.

### Run from Source

**Prerequisites**:
- Rust ([Installation Guide](https://www.rust-lang.org/tools/install))
- Node.js (v18+) and pnpm (`npm install -g pnpm`)
- System dependencies: See [Tauri Prerequisites](https://v2.tauri.app/guides/getting-started/prerequisites/)

**Steps**:

```bash
# 1. Clone the repository
git clone https://github.com/ASong111/deep-reader.git
cd deep-reader

# 2. Install dependencies
pnpm install

# 3. Start development environment
pnpm tauri dev
```

**Configure AI Assistant (Optional)**:
Fill in your API Key in the app's settings interface (supports OpenAI, Claude, Gemini)

---

## 💡 Why Deep Reader?

### Problems with Existing Reading Tools

When using various reading software, we often encounter these frustrations:

- **Fragmented chapters**: A book split into hundreds of chapters, with copyright pages, tables of contents, and prefaces each taking up a separate chapter
- **Data insecurity**: Notes stored in the cloud, worrying about privacy leaks and service shutdowns
- **Feature bloat**: Either too few features to be useful, or too many to find what you need
- **Algorithm captivity**: Recommendations, social features, ads—reading becomes interrupted fragments

### Deep Reader's Solutions

We use technology to solve these problems:

**Smart Chapter Organization**
Through an AI scoring model, automatically identifies chapter importance and hierarchical relationships, merging copyright pages, tables of contents, prefaces, etc., into appropriate positions, making chapter structure align with human reading habits.

**Local-First Architecture**
All data stored on your device, protected with AES-256 encryption. You can backup, export, or delete anytime, maintaining complete control over your data.

**Focused Design**
Only does what reading and note-taking should do—no social features, no recommendations, no ads. Clean interface, intuitive operation.

---

## 🎯 Who Is This For?

Deep Reader might be right for you if you:

- 📚 Frequently read technical books, academic papers, or long-form articles
- 🔐 Value privacy and don't want notes stored on someone else's server
- 🧠 Enjoy taking notes and building knowledge systems
- 🤖 Want AI to assist learning, but not dominate it
- 💻 Appreciate open source software and are willing to help improve it

---

## 🛣️ Development Roadmap

**Near-term goals** (1-2 months):
- [ ] Improve chapter organization visualization/debugging tools
- [ ] Optimize PDF parsing quality
- [ ] Add note export functionality (Markdown/Notion)
- [ ] Improve UI interaction details
- [ ] Complete documentation and user guides

**Mid-term goals** (3-6 months):
- [ ] Support more AI models
- [ ] Add data sync functionality (encrypted sync)
- [ ] Support custom AI prompt templates
- [ ] Mobile adaptation

**Long-term vision**:
Build a knowledge management ecosystem that truly respects users, protects privacy, and focuses on reading.

---

## 🤝 How to Participate?

### As a User

1. **Try and provide feedback**
   - Download and try it, tell us about your experience
   - Submit suggestions and issues in [Issues](https://github.com/ASong111/deep-reader/issues)
   - Join discussions, share your reading habits and needs

2. **Spread the word**
   - If you share our philosophy, please tell your friends
   - Give the project a ⭐️ to help more people discover it

### As a Developer

1. **Contribute code**
   - Fork the project and submit Pull Requests
   - See [Development Documentation](docs/development.md) for technical details
   - Check [CLAUDE.md](CLAUDE.md) for project architecture

2. **Improve documentation**
   - Complete user guides
   - Translate documentation to other languages
   - Share your usage tips

### Contact Us

- **GitHub Issues**: [Submit issues and suggestions](https://github.com/ASong111/deep-reader/issues)
- **Discussions**: [Join discussions](https://github.com/ASong111/deep-reader/discussions)

---

## 📚 Technical Highlights

### Smart Chapter Merging System

This is one of Deep Reader's core innovations. We developed a smart chapter merging system based on a 6-dimensional scoring model:

- **TOC semantic analysis**: Understand hierarchical relationships in table of contents structure
- **Title strength recognition**: Distinguish between "Chapter 1" and "Section 1.1"
- **Length reasonableness judgment**: Avoid chapters that are too short or too long
- **Content type identification**: Automatically identify copyright pages, tables of contents, prefaces, etc.
- **Position awareness**: Consider chapter position within the book
- **Continuity analysis**: Determine if chapter numbering is sequential

**Effect comparison**:

| Traditional Parsing | After Smart Merging |
|---------|-----------|
| Copyright page (separate chapter) | ✅ Merged into first chapter |
| Table of contents (separate chapter) | ✅ Merged into first chapter |
| Preface (separate chapter) | ✅ Merged into first chapter |
| Chapter 1 | Chapter 1 (includes front matter) |
| Section 1.1 | ├─ Section 1.1 |
| Section 1.2 | └─ Section 1.2 |

Detailed technical documentation: [Chapter Merging Scoring Rules PRD](docs/章节合并评分规则_prd.md)

### Tech Stack

- **Backend**: Rust + Tauri v2 + SQLite
- **Frontend**: React 19 + TypeScript + TailwindCSS
- **Encryption**: AES-256-GCM
- **Parsing**: Multi-format support for EPUB/PDF/Markdown/TXT/HTML

---

## 📄 License

This project is licensed under [GPL v3](LICENSE).

This means:
- ✅ You can freely use, modify, and distribute
- ✅ You can use it for commercial purposes
- ⚠️ Modified versions must also be open source
- ⚠️ Must retain original author information

---

## 🙏 Acknowledgments

Thanks to all developers who contribute to the open source community.

Deep Reader is built on these excellent open source projects:
- [Tauri](https://tauri.app/) - Cross-platform desktop application framework
- [React](https://react.dev/) - User interface library
- [Rust](https://www.rust-lang.org/) - Systems programming language
- And many other open source libraries (see package.json and Cargo.toml)

---

<p align="center">
  <strong>Bring reading back to its essence. Your knowledge, truly yours.</strong>
</p>

<p align="center">
  If you share this philosophy, please give us a ⭐️
</p>

<p align="center">
  <sub>Made with ❤️ by developers who love reading</sub>
</p>
