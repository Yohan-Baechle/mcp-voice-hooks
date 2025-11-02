export interface Utterance {
  id: string;
  text: string;
  timestamp: Date | string;
  status: 'pending' | 'delivered';
}

export interface UtteranceQueue {
  utterances: Utterance[];
  add(text: string): Utterance;
  getRecent(limit?: number): Utterance[];
  markDelivered(id: string): void;
  clear(): void;
}

export interface VoicePreferences {
  voiceResponsesEnabled: boolean;
}

export interface TTSEvent {
  type: 'speak' | 'waitStatus';
  text?: string;
  isWaiting?: boolean;
}

export interface AccessibilityCallbacks {
  toggleListening?: () => void;
  refresh?: () => void;
  testVoice?: () => void;
  stopListening?: () => void;
}

export interface SpeechRecognitionCallbacks {
  onStart?: () => void;
  onStop?: () => void;
  onFinalResult?: (transcript: string) => void;
  onUtteranceSent?: (text: string) => void;
  onError?: (message: string) => void;
}

export interface SpeechSynthesisCallbacks {
  onLanguageChange?: (language: string) => void;
  onVoiceChange?: (voiceName: string) => void;
  onTest?: () => void;
  onToggleVoiceResponses?: (enabled: boolean) => void;
  onWaitStatusChange?: (isWaiting: boolean) => void;
}

export interface MessageManagerCallbacks {
  onRefresh?: () => void;
  onClearStart?: () => void;
  onClearSuccess?: (result: any) => void;
  onError?: (message: string) => void;
}
