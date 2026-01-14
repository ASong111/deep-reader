# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Deep Reader (深度阅读器) is a local-first, privacy-focused immersive reading and knowledge management tool built with Tauri v2 + React 19 + Rust. It features an intelligent chapter merging system, multi-format book parsing (EPUB/PDF/TXT/Markdown/HTML), encrypted note-taking, and AI assistant integration.

**Key Philosophy**: Local-first architecture with AES-256-GCM encryption. User data never leaves the device unless explicitly configured.

## Development Commands

### Frontend (React + TypeScript)
```bash
# Install dependencies
pnpm install

# Start development server (frontend only)
pnpm dev

# Run Tauri development environment (recommended)
pnpm tauri dev

# Build frontend
pnpm build

# Run tests
pnpm test

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage
```

### Backend (Rust + Tauri)
```bash
# Run Rust tests
cd src-tauri
cargo test

# Run specific test
cargo test test_name

# Run tests with output
cargo test -- --nocapture

# Build production binary
pnpm build:prod

# Build for Windows (from Linux)
pnpm build:win
```

### Tauri Commands
```bash
# Build Tauri app
pnpm tauri build

# Run Tauri dev mode
pnpm tauri dev
```

## Architecture Overview

### High-Level Structure

```
Frontend (React)          Backend (Rust)           Database (SQLite)
     │                         │                         │
     ├─ ImmersiveReader ──────►│                         │
     │  └─ ChapterList         │                         │
     │  └─ ReaderContent       │                         │
     │                         │                         │
     ├─ NoteSidebar ──────────►│ Tauri Commands ────────►│ notes
     │  └─ NoteDetailPanel     │ (invoke handlers)       │ categories
     │  └─ TrashView           │                         │ tags
     │                         │                         │
     ├─ AISidebar ────────────►│ AI Integration          │ ai_config
     │  └─ AIConfigDialog      │ (OpenAI/Claude/Gemini)  │
     │                         │                         │
     └─ ReadingUnitDebugger ──►│ Reading Unit Builder ──►│ reading_units
        └─ SegmentTimeline     │ (Chapter Merging)       │ debug_segment_scores
```

### Backend Architecture (Rust)

The Rust backend is organized into several key modules:

**Core Modules**:
- `lib.rs` - Main entry point with all Tauri command handlers (~1500 lines)
- `db.rs` - SQLite database initialization and schema management
- `encryption.rs` - AES-256-GCM encryption for notes
- `async_import.rs` - Asynchronous book import queue system
- `asset_manager.rs` - Image and asset handling (Base64 conversion)

**Parser System** (`src-tauri/src/parser/`):
- `mod.rs` - Parser trait and router (routes file extensions to parsers)
- `epub_parser.rs` - EPUB format parser (native quality)
- `pdf_parser.rs` - PDF format parser (light quality)
- `txt_parser.rs` - Plain text parser
- `md_parser.rs` - Markdown parser
- `chapter_detector.rs` - Heuristic chapter detection for unstructured formats

**Reading Unit Builder** (`src-tauri/src/reading_unit/`):
This is the **core innovation** of Deep Reader - an intelligent chapter merging system that solves the "too many chapters" problem in e-books.

- `types.rs` - Core data structures (Segment, ReadingUnit, etc.)
- `segment_builder.rs` - Builds candidate segments from parser output
- `feature_extractor.rs` - Extracts 6-dimensional features from segments
- `scoring_engine.rs` - Calculates weighted scores for merge decisions
- `decision_engine.rs` - 4-tier priority decision system
- `reading_unit_builder.rs` - Constructs final chapter structure
- `fallback_strategy.rs` - Fallback logic when scoring fails
- `integration_tests.rs` - End-to-end tests for the system

**How Reading Unit Builder Works**:
1. Parser outputs raw chapters → Segment Builder creates candidates
2. Feature Extractor analyzes 6 dimensions (TOC level, title strength, length, content type, position, continuity)
3. Scoring Engine calculates weighted scores (weights: 1.5, 1.2, 1.0, 1.0, 0.8, 0.8)
4. Decision Engine uses 4-tier priority system to decide merge/split
5. Reading Unit Builder constructs final 2-level hierarchy (chapter → sections)
6. Results persisted to `reading_units` table with debug data in `debug_segment_scores`

### Frontend Architecture (React)

**Component Structure**:
- `components/immersive-reader/` - Main reading interface
  - `ImmersiveReader.tsx` - Container component
  - `BookCard.tsx` - Book grid display
  - `ChapterList.tsx` - Chapter navigation sidebar
  - `ReaderContent.tsx` - Content rendering with IRP (Internal Representation Protocol)

- `components/notes/` - Note-taking system
  - `NoteSidebar.tsx` - Note list and search
  - `NoteDetailPanel.tsx` - Note editor
  - `CreateNoteDialog.tsx` - Note creation modal
  - `TrashView.tsx` - Soft-deleted notes
  - `AnalyticsView.tsx` - Note statistics

- `components/ai/` - AI assistant integration
  - `AISidebar.tsx` - AI chat interface
  - `AIConfigDialog.tsx` - API key configuration

- `components/debug/` - Developer tools
  - `ReadingUnitDebugger.tsx` - Visualize chapter merging decisions
  - `SegmentTimeline.tsx` - Timeline view of segments
  - `SegmentDetailPanel.tsx` - Detailed scoring breakdown

**State Management**: React hooks with local state (no Redux/Zustand)

**Styling**: TailwindCSS with custom theme colors (light: `#F5F1E8`, dark: `#2D2520`)

### Database Schema

**Core Tables**:
- `books` - Book metadata (title, author, file_path, parse_status, parse_quality)
- `chapters` - Chapter data (title, chapter_index, confidence_level, raw_html, render_mode)
- `blocks` - Content blocks in IRP format (block_type, runs_json)
- `asset_mappings` - Image/asset path mappings (original_path → local_path)
- `reading_progress` - User reading position (book_id, chapter_id, block_id, scroll_offset)

**Note System**:
- `notes` - Encrypted notes (title, content, highlighted_text, annotation_type)
- `categories` - Note categories
- `tags` - Note tags
- `note_tags` - Many-to-many relationship

**AI & Debug**:
- `ai_config` - AI provider configurations (platform, api_key, model, temperature)
- `reading_units` - Final chapter structure from Reading Unit Builder
- `debug_segment_scores` - Detailed scoring data for debugging

### IRP (Internal Representation Protocol)

Deep Reader uses a custom intermediate format called IRP to represent book content:

```typescript
Block {
  block_type: "paragraph" | "heading" | "image" | "code"
  runs: TextRun[]
}

TextRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  code?: boolean
}
```

**Why IRP?**
- Format-agnostic: EPUB/PDF/TXT/Markdown all convert to IRP
- Enables consistent rendering across formats
- Supports mixed rendering modes (some chapters use raw HTML, others use IRP)

### Render Modes

Chapters can use two render modes:
- `"irp"` - Render using IRP blocks (default for TXT/PDF/Markdown)
- `"html"` - Render using raw HTML (default for EPUB to preserve original styling)

## Key Technical Decisions

### Why Tauri v2?
- Smaller binary size than Electron (~10MB vs ~100MB)
- Better security model (no Node.js in production)
- Native Rust performance for parsing and encryption
- Cross-platform (Windows/macOS/Linux)

### Why SQLite?
- Local-first architecture requirement
- Zero-configuration embedded database
- ACID transactions for data integrity
- Full-text search support

### Why Not Convert Everything to IRP?
EPUB and Markdown formats preserve their original HTML to maintain author's intended styling (fonts, colors, spacing). PDF and TXT are converted to IRP because they lack semantic structure.

### Encryption Strategy
- Only `notes.content` and `notes.highlighted_text` are encrypted
- Book content is NOT encrypted (performance reasons)
- Encryption key stored in app data directory (`encryption.key`)
- AES-256-GCM mode with random nonce per encryption

## Common Development Patterns

### Adding a New Tauri Command

1. Define the command in `src-tauri/src/lib.rs`:
```rust
#[tauri::command]
async fn my_command(param: String) -> Result<String, String> {
    // Implementation
    Ok("result".to_string())
}
```

2. Register in `invoke_handler!` macro:
```rust
tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        my_command,
        // ... other commands
    ])
```

3. Call from frontend:
```typescript
import { invoke } from "@tauri-apps/api/core";

const result = await invoke<string>("my_command", { param: "value" });
```

### Adding a New Parser

1. Create `src-tauri/src/parser/my_format_parser.rs`
2. Implement the `Parser` trait:
```rust
impl Parser for MyFormatParser {
    fn parse(&self, file_path: &Path, book_id: i32, conn: &Connection) -> Result<ParseResult, String> {
        // Parse logic
    }

    fn get_quality(&self) -> ParseQuality {
        ParseQuality::Native // or Light/Experimental
    }

    fn supported_extensions(&self) -> Vec<&str> {
        vec!["myformat"]
    }
}
```

3. Register in `ParserRouter::new()` in `parser/mod.rs`

### Working with Reading Unit Builder

The Reading Unit Builder is tested extensively. When modifying:
1. Run `cargo test reading_unit` to run all related tests
2. Check `integration_tests.rs` for end-to-end test examples
3. Use the Debug panel in the UI to visualize scoring decisions
4. Refer to `docs/智能章节合并系统技术文档.md` for detailed design

### Testing Frontend Components

```typescript
// src/components/__tests__/MyComponent.test.tsx
import { render, screen } from '@testing-library/react';
import MyComponent from '../MyComponent';

test('renders component', () => {
  render(<MyComponent />);
  expect(screen.getByText('Hello')).toBeInTheDocument();
});
```

Run with: `pnpm test`

## Important Constraints

### Security
- Never commit API keys or encryption keys
- Always validate user input in Tauri commands
- Use parameterized SQL queries (rusqlite handles this)
- Sanitize HTML with DOMPurify before rendering

### Performance
- Large books (>1000 chapters) should use async import queue
- Images are converted to Base64 and stored in `asset_mappings` table
- Reading progress is debounced (save every 2 seconds, not on every scroll)

### Cross-Platform
- Use `Path` and `PathBuf` instead of string concatenation for file paths
- Test on Windows/Linux/macOS if modifying file system operations
- Use Tauri's dialog plugin for file pickers (don't use native dialogs)

## Debugging

### Enable Rust Logging
```rust
println!("Debug: {:?}", variable);  // Simple debug
eprintln!("Error: {}", error);      // Error output
```

### Frontend DevTools
- Open with F12 in development mode
- Use React DevTools extension
- Check Tauri console for backend errors

### Reading Unit Debug Panel
- Press the bug icon in the UI to open debug panel
- Shows segment timeline, scoring breakdown, and merge decisions
- Useful for understanding why chapters were merged/split

### Database Inspection
```bash
# Open database in SQLite CLI
sqlite3 ~/Library/Application\ Support/com.deep-reader.app/deep-reader.db

# Or use a GUI tool like DB Browser for SQLite
```

## File Locations

### Development
- Frontend: `src/`
- Backend: `src-tauri/src/`
- Tests: `src/test/` (frontend), `src-tauri/src/**/*_test.rs` (backend)
- Docs: `docs/`

### Production (macOS example)
- App data: `~/Library/Application Support/com.deep-reader.app/`
- Database: `~/Library/Application Support/com.deep-reader.app/deep-reader.db`
- Encryption key: `~/Library/Application Support/com.deep-reader.app/encryption.key`
- Logs: `~/Library/Logs/com.deep-reader.app/`

## Additional Resources

- Tauri v2 docs: https://v2.tauri.app/
- Reading Unit Builder design: `docs/智能章节合并系统技术文档.md`
- Multi-format parsing: `docs/multi-format-paring-task.md`
- Development guide: `docs/development.md`
- User guide: `docs/user-guide.md`
