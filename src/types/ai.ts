export interface AIConfig {
    id: number;
    platform: string;
    api_key: string | null;
    base_url: string | null;
    model: string;
    temperature: number;
    max_tokens: number;
    is_active: boolean;
  }
  
  export interface AIRequest {
    note_content: string;
    note_title: string;
    highlighted_text?: string | null;
    action: "summarize" | "questions" | "suggestions" | "expand";
  }