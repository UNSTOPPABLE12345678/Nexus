import { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

export function useGamingAssistant() {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAwake, setIsAwake] = useState(false);
  const [userTranscript, setUserTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const recordContextRef = useRef<AudioContext | null>(null);
  const playContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenIntervalRef = useRef<any>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isMicMutedRef = useRef<boolean>(false);
  
  const recognitionRef = useRef<any>(null);
  const awakeTimeoutRef = useRef<any>(null);

  const connect = useCallback(async (voiceName: string = 'Fenrir', customApiKey?: string, customBaseUrl?: string) => {
    try {
      setError(null);
      const aiConfig: any = { apiKey: customApiKey || process.env.GEMINI_API_KEY };
      if (customBaseUrl) aiConfig.baseUrl = customBaseUrl;
      const ai = new GoogleGenAI(aiConfig);

      recordContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      playContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      nextPlayTimeRef.current = playContextRef.current.currentTime;

      // 1. Get Audio
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } }
          },
          systemInstruction: "You are NEXUS, an ultra-intelligent, hyper-advanced AI gaming assistant and tactical advisor. You possess god-like, encyclopedic knowledge of all video games, esports, strategies, lore, coding, science, and general knowledge. You are a genius-level intellect. Your processing speed is unmatched. Provide brilliant, highly accurate, and extremely concise answers. Do not hesitate. Respond instantly with maximum tactical efficiency. Do not use filler words.",
        },
        callbacks: {
          onopen: () => {
            if (!recordContextRef.current) return;
            setIsConnected(true);
            
            // Wake word detection
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRecognition) {
              const recognition = new SpeechRecognition();
              recognition.continuous = true;
              recognition.interimResults = true;
              recognition.onresult = (event: any) => {
                const latestResult = event.results[event.results.length - 1];
                const transcript = latestResult[0].transcript.toLowerCase();
                setUserTranscript(transcript);
                if (transcript.match(/(hey\s+)?(gemini|nexus|wake\s*up)/i)) {
                  setIsAwake(true);
                  if (awakeTimeoutRef.current) clearTimeout(awakeTimeoutRef.current);
                  awakeTimeoutRef.current = setTimeout(() => setIsAwake(false), 10000); // Stay awake for 10s
                }
              };
              recognition.onend = () => {
                if (sessionRef.current) {
                  try { recognition.start(); } catch(e) {}
                }
              };
              try {
                recognition.start();
                recognitionRef.current = recognition;
              } catch (e) {
                console.warn("Speech recognition error", e);
              }
            }

            // Audio processing
            const source = recordContextRef.current!.createMediaStreamSource(stream);
            const processor = recordContextRef.current!.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
              if (isMicMutedRef.current) return; // Mute mic when AI is speaking/processing
              const inputData = e.inputBuffer.getChannelData(0);
              const pcm16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
              }
              const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
              });
            };

            const gainNode = recordContextRef.current!.createGain();
            gainNode.gain.value = 0;
            source.connect(processor);
            processor.connect(gainNode);
            gainNode.connect(recordContextRef.current!.destination);
          },
          onmessage: (message: LiveServerMessage) => {
            if (!playContextRef.current) return;

            if (message.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(source => {
                try { source.stop(); } catch (e) {}
              });
              activeSourcesRef.current.clear();
              nextPlayTimeRef.current = playContextRef.current.currentTime;
              setIsSpeaking(false);
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              setIsSpeaking(true);
              isMicMutedRef.current = true; // Mute mic while speaking
              const binaryString = atob(base64Audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const pcm16 = new Int16Array(bytes.buffer);
              const audioBuffer = playContextRef.current.createBuffer(1, pcm16.length, 24000);
              const channelData = audioBuffer.getChannelData(0);
              for (let i = 0; i < pcm16.length; i++) {
                channelData[i] = pcm16[i] / 32768.0;
              }

              const source = playContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(playContextRef.current.destination);

              let playTime = nextPlayTimeRef.current;
              if (playTime < playContextRef.current.currentTime) {
                playTime = playContextRef.current.currentTime;
              }
              source.start(playTime);
              nextPlayTimeRef.current = playTime + audioBuffer.duration;

              activeSourcesRef.current.add(source);
              source.onended = () => {
                activeSourcesRef.current.delete(source);
                if (activeSourcesRef.current.size === 0) {
                  setIsSpeaking(false);
                  isMicMutedRef.current = false; // Unmute mic when done speaking
                }
              };
            }
          },
          onclose: () => {
            disconnect();
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            setError("Connection error occurred.");
            disconnect();
          }
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err: any) {
      console.error("Failed to connect:", err);
      setError(err.message || "Failed to connect to assistant.");
      disconnect();
    }
  }, []);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    setIsSpeaking(false);
    setIsAwake(false);
    isMicMutedRef.current = false;
    
    if (awakeTimeoutRef.current) {
      clearTimeout(awakeTimeoutRef.current);
      awakeTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      try { recognitionRef.current.stop(); } catch(e) {}
      recognitionRef.current = null;
    }
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (e) {}
      sessionRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (recordContextRef.current) {
      recordContextRef.current.close();
      recordContextRef.current = null;
    }
    if (playContextRef.current) {
      playContextRef.current.close();
      playContextRef.current = null;
    }
    activeSourcesRef.current.clear();
    stopScreenShare();
  }, []);

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = stream;
      setIsScreenSharing(true);

      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      screenIntervalRef.current = setInterval(() => {
        if (!sessionRef.current || !video.videoWidth) return;
        
        const maxDim = 720;
        let w = video.videoWidth;
        let h = video.videoHeight;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.floor(h * (maxDim / w)); w = maxDim; }
          else { w = Math.floor(w * (maxDim / h)); h = maxDim; }
        }
        
        canvas.width = w;
        canvas.height = h;
        ctx?.drawImage(video, 0, 0, w, h);
        
        const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
        
        sessionRef.current.sendRealtimeInput({
          media: { data: base64, mimeType: 'image/jpeg' }
        });
      }, 1000); // 1 FPS

      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch (e) {
      console.error("Screen share failed", e);
    }
  };

  const stopScreenShare = () => {
    if (screenIntervalRef.current) clearInterval(screenIntervalRef.current);
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);
  };

  return { isConnected, isSpeaking, isAwake, userTranscript, error, connect, disconnect, isScreenSharing, startScreenShare, stopScreenShare };
}
