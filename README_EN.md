# Deep Reader

<p align="center">
  <strong>English</strong> | <a href="README.md">简体中文</a>
</p>

<p align="center">
  <img src="src-tauri/icons/128x128.png" width="128" height="128" alt="Deep Reader Logo">
</p>

<p align="center">
  <strong>A local-first, privacy-focused immersive reading and knowledge management tool built with Tauri + React + Rust.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-blue?logo=tauri" alt="Tauri Version">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React Version">
  <img src="https://img.shields.io/badge/Rust-2021-000000?logo=rust" alt="Rust Edition">
  <img src="https://img.shields.io/badge/License-GPL--3.0-green" alt="License">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome">
</p>

---

## 🌟 Overview

Deep Reader is designed for knowledge workers, students, and privacy-conscious users. It's not just a reader—it's a deep learning workstation with integrated AI assistance. Through local encrypted storage and powerful AI integration, Deep Reader helps you capture and manage knowledge efficiently while enjoying an immersive reading experience.

> [!IMPORTANT]
> **Local-first**: Your data belongs to you. Unless you explicitly configure it, your data never leaves your device.

## 🌍 Languages

Deep Reader supports multiple languages:
- **English** (Default)
- **简体中文** (Chinese Simplified)

You can switch languages in Settings → General → Language.

## ✨ Core Features

### 📖 Immersive Reader
- **Multi-format Support**: Optimized import for EPUB/PDF/TXT/Markdown/HTML with perfect metadata and TOC parsing.
- **Intelligent Chapter Merging**: AI-powered chapter merging system that automatically identifies and merges copyright pages, TOC, prefaces, and other metadata to avoid fragmented chapters.
- **Typography Optimization**: Carefully designed reading interface with Base64 image localization for smooth offline reading.
- **Fullscreen Immersion**: Press `F11` to toggle fullscreen mode and eliminate distractions.
- **Interactive Annotations**: Seamlessly highlight and underline text while reading.

### 📝 Knowledge Management (Zettelkasten-inspired)
- **Multi-dimensional Organization**: Custom categories and multi-level tag system for flexible knowledge base management.
- **Smart Search**: Full-text search across note titles, content, and highlighted text.
- **Trash Mechanism**: Built-in trash with 30-day auto-cleanup for worry-free deletion.

### 🛡️ Privacy & Security
- **AES-256 Encryption**: Note content encrypted locally using `aes-gcm`.
- **Fully Local**: All data stored in local SQLite database, no forced cloud upload.
- **No Tracking**: The app collects no user behavior data.

### 🤖 Deep AI Integration
- **Multi-model Support**: Integrated with OpenAI (GPT-4), Anthropic (Claude 3), Google Gemini.
- **Smart Assistance**:
  - **Summarization**: Extract key points from long texts with one click.
  - **Question Generation**: Generate test questions based on content to check comprehension.
  - **Content Expansion**: Use AI to dig deeper into background knowledge or related information.

## 🛠️ Tech Stack

### Backend (Rust)
- **Tauri v2**: Cross-platform desktop framework
- **Rusqlite**: Local SQLite database driver
- **Epub-rs**: Efficient EPUB parsing engine
- **AES-GCM**: Industrial-grade encryption
- **Reqwest**: Async HTTP client

### Frontend (TypeScript)
- **React 19**: Modern UI library
- **TailwindCSS**: Atomic CSS framework
- **Lucide React**: Clean and beautiful icon library
- **Vite**: Lightning-fast build tool
- **i18next**: Internationalization framework

## 🚀 Quick Start

### Prerequisites

Before starting, ensure your system has:
- **Rust**: [Installation Guide](https://www.rust-lang.org/tools/install)
- **Node.js**: v18+
- **pnpm**: `npm install -g pnpm`
- **System Dependencies**: See [Tauri Prerequisites](https://v2.tauri.app/guides/getting-started/prerequisites/) (Linux users need `build-essential`, `webkit2gtk`, etc.)

### Installation & Running

1. **Clone the project**
   ```bash
   git clone https://github.com/your-username/deep-reader.git
   cd deep-reader
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Start development environment**
   ```bash
   pnpm tauri dev
   ```

4. **AI Configuration**
   Fill in your API Key in the Settings interface. Currently supports OpenAI, Anthropic, and Gemini.

## 📂 Project Structure

```text
├── src/                # Frontend React code
│   ├── components/     # UI components
│   ├── hooks/          # Custom hooks
│   ├── utils/          # Utility functions
│   ├── types/          # Type definitions
│   └── locales/        # Translation files
│       ├── en/         # English translations
│       └── zh-CN/      # Chinese translations
├── src-tauri/          # Rust backend
│   ├── src/
│   │   ├── lib.rs      # Command handlers
│   │   ├── db.rs       # Database layer
│   │   ├── encryption.rs # Encryption logic
│   │   ├── parser/     # Multi-format parsers
│   │   └── reading_unit/ # Intelligent chapter merging system
│   └── Cargo.toml      # Rust dependencies
└── docs/               # Project documentation
```

## 🎯 Technical Highlights

### Intelligent Chapter Merging System (Reading Unit Builder)

Deep Reader implements an advanced chapter merging scoring system that solves the problem of overly fragmented chapters in traditional e-book readers:

#### 🧠 How It Works

The system uses a **6-dimensional scoring model** to intelligently determine whether chapters should be merged:

1. **TOC Semantic Score** (weight 1.5) - Judgment based on TOC hierarchy
2. **Title Strength Score** (weight 1.2) - Identifies strong chapter titles (Chapter X) vs weak titles (Section 1.1)
3. **Length Reasonability Score** (weight 1.0) - Avoids chapters that are too short or too long
4. **Content Type Score** (weight 1.0) - Automatically identifies copyright pages, TOC, prefaces, etc.
5. **Position Penalty Score** (weight 0.8) - Considers chapter position in the book
6. **Continuity Score** (weight 0.8) - Determines if chapter numbering is continuous

#### ✨ Key Features

- **Format-agnostic**: Supports all formats (EPUB/PDF/TXT/Markdown/HTML)
- **Smart Recognition**: Automatically identifies and merges copyright pages, TOC, prefaces, etc.
- **Two-level Structure**: Supports chapter-section hierarchy, perfect for technical books
- **Explainability**: Every decision has clear scoring details and reasoning
- **Fallback Strategy**: Automatically uses simple rules when scoring fails, ensuring system stability
- **Comprehensive Testing**: 46 unit and integration tests ensure code quality

#### 📊 Before & After

| Traditional Parsing | After Smart Merging |
|---------------------|---------------------|
| Copyright Page (separate chapter) | ✅ Merged into Chapter 1 |
| Table of Contents (separate chapter) | ✅ Merged into Chapter 1 |
| Preface (separate chapter) | ✅ Merged into Chapter 1 |
| Chapter 1 | Chapter 1 (includes preface content) |
| Section 1.1 | ├─ Section 1.1 |
| Section 1.2 | └─ Section 1.2 |

#### 🔧 Technical Implementation

```
Parser (format-specific)
 ↓
Segment Builder → Build candidate segments
 ↓
Feature Extractor → Extract 6-dimensional features
 ↓
Scoring Engine → Calculate weighted scores
 ↓
Decision Engine → 4-tier priority decision system
 ↓
Reading Unit Builder → Build final structure
 ↓
Persist to database
```

For detailed design documentation, see: [Chapter Merging Scoring Rules PRD](docs/章节合并评分规则_prd.md)

---

## 🛣️ Roadmap

- [x] PDF format import support
- [x] Markdown/TXT/HTML format import support
- [x] Intelligent chapter merging system
- [x] Multi-language support (English, Chinese)
- [ ] Debug panel visualization (scoring details display)
- [ ] User settings: show/hide preface content
- [ ] AI chapter summary generation
- [ ] Export notes to Markdown/Notion
- [ ] Mobile adaptation (Tauri Mobile)
- [ ] Custom AI prompt templates
- [ ] Multi-device data sync (encrypted sync)

## 🤝 Contributing

We welcome all forms of contribution!

1. Fork this project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Translation Contributions

We especially welcome translations to new languages. To add a new language:

1. Create a new translation file in `src/locales/[language-code]/translation.json`
2. Copy the structure from `src/locales/en/translation.json`
3. Translate all keys to the target language
4. Update `src/i18n.ts` to include the new language
5. Add the language option to `src/components/common/LanguageSwitcher.tsx`

See [Development Guide](docs/development.md) for more details.

## 📄 License

This project is licensed under the [GPL v3](LICENSE) license.

---

<p align="center">
  If this project helps you, please give it a ⭐️!
</p>

<p align="center">
  Made with ❤️ by Deep Reader Team
</p>
