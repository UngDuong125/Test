import { plainText } from '@/lib/vocab-modes';

/** Vocabulary banks have no language field yet: foreign-language subject → English. */
export function speechLangForSubject(subjectId: string): string {
  return subjectId === 'flang' ? 'en-US' : 'vi-VN';
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Read a term aloud with the browser's built-in voice; no-op where unsupported. */
export function speak(text: string, lang: string): void {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(plainText(text));
  utterance.lang = lang;
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  if (voice) utterance.voice = voice;
  utterance.rate = 0.9;
  synth.speak(utterance);
}
