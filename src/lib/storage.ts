export interface ChatHistory {
  id: string;
  title: string;
  preview: string;
  date: string;
  threadId: string;
  messages: {
    id: string;
    content: string;
    isUser: boolean;
    images?: string[];
  }[];
}

function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function saveToLocalStorage(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
}

export function getFromLocalStorage(key: string) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (error) {
    console.error('Error reading from localStorage:', error);
    return null;
  }
}

export function saveChat(chat: ChatHistory) {
  const chats = getFromLocalStorage('chats') || [];
  const chatWithUniqueId = {
    ...chat,
    id: generateUniqueId()
  };
  const updatedChats = [chatWithUniqueId, ...chats];
  saveToLocalStorage('chats', updatedChats);
  return chatWithUniqueId;
}

export function getChats(): ChatHistory[] {
  const chats = getFromLocalStorage('chats') || [];
  return chats.map(chat => ({
    ...chat,
    id: chat.id || generateUniqueId() // Ensure all chats have unique IDs
  }));
}

export function getChatByThreadId(threadId: string): ChatHistory | undefined {
  const chats = getChats();
  return chats.find(chat => chat.threadId === threadId);
}

export function updateChat(updatedChat: ChatHistory) {
  const chats = getChats();
  const index = chats.findIndex(chat => chat.threadId === updatedChat.threadId);
  if (index !== -1) {
    chats[index] = {
      ...updatedChat,
      id: chats[index].id // Preserve the original unique ID
    };
    saveToLocalStorage('chats', chats);
  }
}

export function deleteChat(chatId: string) {
  const chats = getChats();
  const updatedChats = chats.filter(chat => chat.id !== chatId);
  saveToLocalStorage('chats', updatedChats);
}

export function deleteAllChats() {
  saveToLocalStorage('chats', []);
}