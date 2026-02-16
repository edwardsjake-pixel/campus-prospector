import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2 } from "lucide-react";

interface VoiceDictationProps {
  onTranscript: (text: string) => void;
  currentText?: string;
  className?: string;
}

export function VoiceDictation({ onTranscript, currentText = "", className }: VoiceDictationProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const accumulatedRef = useRef(currentText);

  useEffect(() => {
    accumulatedRef.current = currentText;
  }, [currentText]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        const separator = accumulatedRef.current.length > 0 ? " " : "";
        const newText = accumulatedRef.current + separator + finalTranscript;
        accumulatedRef.current = newText;
        onTranscript(newText);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "no-speech") {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      if (isListening) {
        try { recognition.start(); } catch (e) {}
      }
    };

    recognitionRef.current = recognition;

    return () => {
      try { recognition.stop(); } catch (e) {}
    };
  }, []);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.onend = () => {
          if (isListening) {
            try { recognitionRef.current.start(); } catch (e) {}
          }
        };
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error("Failed to start speech recognition:", e);
      }
    }
  }, [isListening]);

  if (!isSupported) return null;

  return (
    <Button
      type="button"
      variant={isListening ? "destructive" : "outline"}
      size="icon"
      onClick={toggleListening}
      className={className}
      data-testid="button-voice-dictation"
      title={isListening ? "Stop dictating" : "Start voice dictation"}
    >
      {isListening ? (
        <MicOff className="h-4 w-4" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
    </Button>
  );
}
