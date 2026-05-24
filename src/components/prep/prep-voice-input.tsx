"use client";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRelayAsrInput } from "@/hooks/use-relay-asr-input";
import { useToast } from "@/hooks/use-toast";
import { Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
};

type Props = {
  language?: string;
  baseText: string;
  onTranscript: (next: string) => void;
  disabled?: boolean;
};

/** Voice capture: Volcengine relay ASR when configured, else browser SpeechRecognition. */
export function PrepVoiceInput({
  language,
  baseText,
  onTranscript,
  disabled,
}: Props) {
  const { toast } = useToast();
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const baseTextRef = useRef(baseText);
  const relayStartRef = useRef<
    (baseText: string) => Promise<boolean>
  >(() => Promise.resolve(false));
  const relayStopRef = useRef<() => void>(() => undefined);
  const relayAvailableRef = useRef(false);

  const relay = useRelayAsrInput({ language, onTranscript });
  relayStartRef.current = relay.start;
  relayStopRef.current = relay.stop;
  relayAvailableRef.current = relay.isRelayAvailable;

  useEffect(() => {
    baseTextRef.current = baseText;
  }, [baseText]);

  const stopBrowser = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const stop = useCallback(() => {
    relayStopRef.current();
    stopBrowser();
    setListening(false);
  }, [stopBrowser]);

  useEffect(() => {
    return () => {
      relayStopRef.current();
      stopBrowser();
    };
  }, [stopBrowser]);

  const startBrowser = useCallback(() => {
    const speechWindow = window as SpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      toast({
        title: "Voice input unavailable",
        description: "Use Chrome or Edge for speech recognition.",
        variant: "destructive",
      });
      return;
    }

    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language === "zh" ? "zh-CN" : "en-US";

    const initialBase = baseTextRef.current.trim();
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      onTranscript(
        [initialBase, transcript.trim()].filter(Boolean).join(" "),
      );
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [language, onTranscript, toast]);

  const start = useCallback(async () => {
    if (relayAvailableRef.current) {
      const ok = await relayStartRef.current(baseTextRef.current);
      if (ok) {
        setListening(true);
        return;
      }
      toast({
        title: "Voice relay unavailable",
        description: "Falling back to browser speech recognition.",
      });
    }
    startBrowser();
  }, [startBrowser, toast]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={listening ? "default" : "outline"}
          size="icon"
          className="h-8 w-8 rounded-full"
          disabled={disabled}
          onClick={listening ? stop : start}
        >
          {listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {listening ? "Stop voice input" : "Start voice input"}
      </TooltipContent>
    </Tooltip>
  );
}
