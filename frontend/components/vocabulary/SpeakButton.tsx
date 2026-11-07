'use client';

import { useEffect, useState } from 'react';
import { canSpeak, speak, speechLangForSubject } from '@/lib/speech';

/** 🔊 button for a vocabulary term. Hidden when the browser has no speech synthesis. */
export function SpeakButton({ text, subjectId }: { text: string; subjectId: string }) {
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(canSpeak()), []);
  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        // Inside the flashcard: do not flip the card.
        e.stopPropagation();
        speak(text, speechLangForSubject(subjectId));
      }}
      aria-label="Nghe phát âm"
      title="Nghe phát âm"
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-xl hover:bg-slate-100"
    >
      🔊
    </button>
  );
}
