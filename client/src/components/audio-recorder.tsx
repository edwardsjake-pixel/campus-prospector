import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Circle, Square, Play, Pause, Trash2, Download } from "lucide-react";
import { format } from "date-fns";

interface Recording {
  id: string;
  blob: Blob;
  url: string;
  duration: number;
  createdAt: Date;
  name: string;
}

interface AudioRecorderProps {
  onRecordingComplete?: (recording: Recording) => void;
  className?: string;
}

export function AudioRecorder({ onRecordingComplete, className }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4",
      });
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        const url = URL.createObjectURL(blob);
        const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
        const recording: Recording = {
          id: crypto.randomUUID(),
          blob,
          url,
          duration,
          createdAt: new Date(),
          name: `Meeting Recording - ${format(new Date(), "h:mm a")}`,
        };
        setRecordings((prev) => [recording, ...prev]);
        onRecordingComplete?.(recording);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      startTimeRef.current = Date.now();
      mediaRecorder.start(1000);
      setIsRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  }, [onRecordingComplete]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    setElapsed(0);
  }, []);

  const togglePlay = useCallback((id: string, url: string) => {
    let audio = audioRefs.current.get(id);
    if (!audio) {
      audio = new Audio(url);
      audio.onended = () => setPlayingId(null);
      audioRefs.current.set(id, audio);
    }
    if (playingId === id) {
      audio.pause();
      setPlayingId(null);
    } else {
      audioRefs.current.forEach((a, key) => { if (key !== id) a.pause(); });
      audio.play();
      setPlayingId(id);
    }
  }, [playingId]);

  const deleteRecording = useCallback((id: string) => {
    const audio = audioRefs.current.get(id);
    if (audio) { audio.pause(); audioRefs.current.delete(id); }
    setRecordings((prev) => {
      const rec = prev.find((r) => r.id === id);
      if (rec) URL.revokeObjectURL(rec.url);
      return prev.filter((r) => r.id !== id);
    });
    if (playingId === id) setPlayingId(null);
  }, [playingId]);

  const downloadRecording = useCallback((rec: Recording) => {
    const a = document.createElement("a");
    a.href = rec.url;
    a.download = `${rec.name}.webm`;
    a.click();
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-3 mb-4">
        {isRecording ? (
          <Button
            type="button"
            variant="destructive"
            onClick={stopRecording}
            data-testid="button-stop-recording"
          >
            <Square className="h-4 w-4 mr-2" />
            Stop Recording ({formatTime(elapsed)})
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={startRecording}
            data-testid="button-start-recording"
          >
            <Circle className="h-4 w-4 mr-2 text-red-500 fill-red-500" />
            Record Meeting
          </Button>
        )}
        {isRecording && (
          <span className="flex items-center gap-2 text-sm text-red-500 font-medium">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            Recording...
          </span>
        )}
      </div>

      {recordings.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recordings ({recordings.length})
          </p>
          {recordings.map((rec) => (
            <Card key={rec.id} className="border shadow-none">
              <CardContent className="flex items-center gap-3 p-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => togglePlay(rec.id, rec.url)}
                  data-testid={`button-play-recording-${rec.id}`}
                >
                  {playingId === rec.id ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" data-testid={`text-recording-name-${rec.id}`}>
                    {rec.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(rec.duration)} - {format(rec.createdAt, "h:mm a")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => downloadRecording(rec)}
                  data-testid={`button-download-recording-${rec.id}`}
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteRecording(rec.id)}
                  data-testid={`button-delete-recording-${rec.id}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
