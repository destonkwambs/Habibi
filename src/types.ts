export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  createdAt: string;
  thinking?: boolean;
  thinkingText?: string;
  groundingUrls?: Array<{ uri: string; title: string }>;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryItem {
  id: string;
  fact: string;
  category?: string;
  createdAt: string;
}

export interface UserSettings {
  nickname: string;
  voiceName: string;
  theme: 'amber' | 'emerald' | 'cyan' | 'rose' | 'slate';
}

export interface WorkspaceEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
}

export interface WorkspaceMail {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
}

export interface WorkspaceFile {
  id: string;
  name: string;
  mimeType: string;
  iconLink?: string;
  modifiedTime?: string;
}

export interface WorkspaceTask {
  id: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string;
}

export interface WorkspaceContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}
