import { useEffect, useRef, useState } from 'react';
import { useGamingAssistant } from './hooks/useGamingAssistant';
import { Mic, MicOff, X, MonitorUp, MonitorOff } from 'lucide-react';
import './index.css';

export default function App() {
  const [voice, setVoice] = useState('Fenrir');
  const [hasCustomKey, setHasCustomKey] = useState(false);
  const [customApiKeyInput, setCustomApiKeyInput] = useState('');
  const [customBaseUrlInput, setCustomBaseUrlInput] = useState('');
  const [isOverlayMode, setIsOverlayMode] = useState(false);
  const { isConnected, isSpeaking, isAwake, error, connect, disconnect, userTranscript, isScreenSharing, startScreenShare, stopScreenShare } = useGamingAssistant();
  const bgRef = useRef<HTMLCanvasElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const [time, setTime] = useState('--:--:--');
  const [metrics, setMetrics] = useState({ freq: '—', ping: '—', conf: '—', db: '—' });

  // Check API Key Status
  const checkApiKey = async () => {
    // @ts-ignore
    if (window.aistudio && window.aistudio.hasSelectedApiKey) {
      // @ts-ignore
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setHasCustomKey(hasKey);
    }
  };

  useEffect(() => {
    checkApiKey();
  }, []);

  const handleSetApiKey = async () => {
    // @ts-ignore
    if (window.aistudio && window.aistudio.openSelectKey) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      checkApiKey();
    } else {
      alert("API Key selection is handled by the AI Studio platform.");
    }
  };

  const requestAllPermissions = async () => {
    try {
      // Request Microphone & Camera
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      // Request Geolocation
      navigator.geolocation.getCurrentPosition(() => {}, () => {});
      alert("SYSTEM OVERRIDE GRANTED: Audio, Video, and Location sensors online.");
    } catch (e) {
      alert("PERMISSION DENIED: " + (e as Error).message);
    }
  };

  const toggleOverlayMode = () => {
    setIsOverlayMode(!isOverlayMode);
  };

  // Keybinds & Long Press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space' && e.ctrlKey) {
        e.preventDefault();
        if (isConnected) disconnect();
        else connect(voice, customApiKeyInput, customBaseUrlInput);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConnected, connect, disconnect, voice, customApiKeyInput, customBaseUrlInput]);

  const handleTouchStart = () => {
    pressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(50);
      if (isConnected) disconnect();
      else connect(voice, customApiKeyInput, customBaseUrlInput);
    }, 600); // 600ms long press
  };

  const handleTouchEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  // Clock
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-GB', { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Metrics
  useEffect(() => {
    if (!isConnected) {
      setMetrics({ freq: '—', ping: '—', conf: '—', db: '—' });
      return;
    }
    const timer = setInterval(() => {
      setMetrics({
        freq: Math.round(400 + Math.random() * 2400).toString(),
        ping: Math.round(6 + Math.random() * 18) + 'ms',
        conf: Math.round(87 + Math.random() * 12) + '%',
        db: '-' + Math.round(12 + Math.random() * 18)
      });
    }, 220);
    return () => clearInterval(timer);
  }, [isConnected]);

  // Background Particles
  useEffect(() => {
    const canvas = bgRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const particles = Array.from({ length: 90 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.2 + 0.3,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      a: Math.random() * 0.6 + 0.15
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,245,255,${p.a})`;
        ctx.fill();
      });
      animationFrameId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Waveform
  useEffect(() => {
    const canvas = waveRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let phase = 0;
    const BARS = 64;

    const draw = () => {
      const mode = isSpeaking ? 'speaking' : isAwake ? 'listening' : isConnected ? 'thinking' : 'idle';
      const W = canvas.offsetWidth || 520;
      canvas.width = W * devicePixelRatio;
      canvas.height = 60 * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
      const w = W, h = 60;
      ctx.clearRect(0, 0, w, h);
      const cy = h / 2, barW = w / BARS;

      for (let i = 0; i < BARS; i++) {
        const t = i / BARS;
        let amp, colour;
        if (mode === 'listening') {
          amp = (Math.sin(t * Math.PI * 6 + phase) * 0.45 + 0.55) * (Math.sin(t * Math.PI * 2.3 - phase * 0.7) * 0.3 + 0.7) * (18 + Math.random() * 12);
          colour = `rgba(255,0,200,${0.55 + amp / 70})`;
        } else if (mode === 'thinking') {
          amp = (Math.sin(t * Math.PI * 4 + phase) * 0.5 + 0.5) * (10 + Math.sin(i * 0.4 + phase) * 8);
          colour = `rgba(255,208,0,${0.4 + amp / 50})`;
        } else if (mode === 'speaking') {
          amp = (Math.sin(t * Math.PI * 5 + phase) * 0.4 + 0.6) * (Math.sin(t * Math.PI * 1.7 - phase * 0.5) * 0.35 + 0.65) * (14 + Math.random() * 10);
          colour = `rgba(0,255,159,${0.5 + amp / 60})`;
        } else {
          amp = Math.sin(t * Math.PI * 2 + phase * 0.3) * 2.5 + 3.5;
          colour = `rgba(0,245,255,${0.2 + amp / 25})`;
        }
        ctx.fillStyle = colour;
        ctx.fillRect(i * barW + 1, cy - amp, barW - 2, amp * 2);
      }
      phase += mode === 'listening' ? 0.18 : mode === 'thinking' ? 0.12 : mode === 'speaking' ? 0.22 : 0.04;
      animationFrameId = requestAnimationFrame(draw);
    };
    draw();

    return () => cancelAnimationFrame(animationFrameId);
  }, [isConnected, isAwake, isSpeaking]);

  const getStatus = () => {
    if (isSpeaking) return 'speaking';
    if (isAwake) return 'listening';
    if (isConnected) return 'thinking';
    return 'standby';
  };

  const status = getStatus();

  return (
    <div className={isOverlayMode ? 'overlay-mode-container' : ''}>
      <canvas id="bg" ref={bgRef}></canvas>
      
      {isOverlayMode ? (
        <div className={`siri-overlay ${status}`}>
          <div className="siri-glow"></div>
          <div className="siri-content">
            <button className="siri-btn" onClick={() => isConnected ? disconnect() : connect(voice, customApiKeyInput, customBaseUrlInput)}>
              {isConnected ? <Mic size={24} color="#fff" /> : <MicOff size={24} color="#ff4444" />}
            </button>
            
            <div className="siri-text">
              {status === 'listening' ? 'Listening...' : status === 'speaking' ? 'Speaking...' : 'NEXUS Standby'}
            </div>

            <button className="siri-btn" onClick={() => isScreenSharing ? stopScreenShare() : startScreenShare()} disabled={!isConnected}>
              {isScreenSharing ? <MonitorOff size={20} color="#00ff00" /> : <MonitorUp size={20} color={isConnected ? "#fff" : "#555"} />}
            </button>

            <button className="siri-btn" onClick={() => setIsOverlayMode(false)}>
              <X size={24} color="#fff" />
            </button>
          </div>
        </div>
      ) : (
      <div className="shell">
        <div className="hdr">
          <span className="hdr-title glitch">NEXUS // VOICE CORE AI</span>
          <span className="hdr-id" id="clock">{time}</span>
        </div>

        <div className="main-row">
          <div className="stage">
            <div className="hex-ring hr1">
              <svg viewBox="0 0 174 174" fill="none"><polygon points="87,3 167,45 167,129 87,171 7,129 7,45" stroke="rgba(0,245,255,.35)" strokeWidth="1" strokeDasharray="8 5" fill="none"/><circle cx="87" cy="3" r="2.5" fill="#00f5ff" opacity=".8"/><circle cx="167" cy="45" r="2.5" fill="#00f5ff" opacity=".8"/><circle cx="167" cy="129" r="2.5" fill="#00f5ff" opacity=".8"/><circle cx="87" cy="171" r="2.5" fill="#00f5ff" opacity=".8"/><circle cx="7" cy="129" r="2.5" fill="#00f5ff" opacity=".8"/><circle cx="7" cy="45" r="2.5" fill="#00f5ff" opacity=".8"/></svg>
            </div>
            <div className="hex-ring hr2">
              <svg viewBox="0 0 148 148" fill="none"><polygon points="74,5 141,41 141,107 74,143 7,107 7,41" stroke="rgba(255,0,200,.28)" strokeWidth="1" strokeDasharray="4 8" fill="none"/></svg>
            </div>
            <div className="hex-ring hr3">
              <svg viewBox="0 0 122 122" fill="none"><polygon points="61,4 117,34 117,88 61,118 5,88 5,34" stroke="rgba(0,245,255,.22)" strokeWidth="1" fill="none"/></svg>
            </div>
            <div className="ripple r1" id="rip1"></div>
            <div className="ripple r2" id="rip2"></div>
            <div className="ripple r3" id="rip3"></div>
            <div className="ripple r4" id="rip4"></div>
            <div 
              className={`orb ${status === 'listening' ? 'listening' : status === 'speaking' ? 'speaking' : ''}`} 
              id="orb" 
              onClick={() => isConnected ? disconnect() : connect(voice, customApiKeyInput, customBaseUrlInput)}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
            >
              <div className="orb-inner"></div>
            </div>
          </div>

          <div className="transcript-col">
            <div className="tx-box">
              <div className="tx-label">YOU SAID</div>
              <div className="tx-text you" id="txYou">{userTranscript || '—'}</div>
            </div>
            <div className="tx-box">
              <div className="tx-label">NEXUS HEARD</div>
              <div className="tx-text nexus" id="txInterim" style={{ color: 'rgba(0,255,159,.4)', fontStyle: 'italic' }}>
                {isConnected ? (isAwake ? 'Listening...' : 'Awaiting wake word ("Hey Gemini")...') : 'Tap orb or ACTIVATE to connect'}
              </div>
            </div>
            {error && (
              <div className="tx-box" id="errorBox" style={{ borderColor: 'rgba(255,80,80,.3)' }}>
                <div className="tx-label" style={{ color: 'rgba(255,80,80,.4)' }}>ERROR</div>
                <div className="tx-text err" id="txError">{error}</div>
              </div>
            )}
          </div>
        </div>

        <div className="ai-response" id="aiResponse">
          <div className="ai-response-label">NEXUS // AI RESPONSE</div>
          <div className={`ai-response-text ${isSpeaking ? '' : 'thinking'}`} id="aiText">
            {isSpeaking ? 'AUDIO TRANSMISSION ACTIVE...' : isConnected ? 'AWAITING VOICE INPUT...' : 'SYSTEM OFFLINE'}
          </div>
        </div>

        <canvas id="wave" ref={waveRef} width="520" height="60"></canvas>

        <div className="status-strip">
          <div className={`status-dot ${status}`} id="sdot"></div>
          <div className={`status-label ${status}`} id="slabel">
            {status === 'listening' ? 'LISTENING' : status === 'thinking' ? 'PROCESSING' : status === 'speaking' ? 'RESPONDING' : 'STANDBY'}
          </div>
          <div className="status-bar-wrap"><div className={`status-bar ${status}`} id="sbar"></div></div>
        </div>

        <div className="metrics">
          <div className="metric"><span className="metric-val" id="mfreq">{metrics.freq}</span><span className="metric-key">FREQ</span></div>
          <div className="metric"><span className="metric-val" id="mping">{metrics.ping}</span><span className="metric-key">PING</span></div>
          <div className="metric"><span className="metric-val" id="mconf">{metrics.conf}</span><span className="metric-key">CONF</span></div>
          <div className="metric"><span className="metric-val" id="mdb">{metrics.db}</span><span className="metric-key">dB</span></div>
        </div>

        <div style={{ width: '100%', marginBottom: '1rem', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div className="metric" style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', padding: '0.4rem 0.6rem' }}>
            <span className="metric-key">WEB SEARCH</span>
            <span className="metric-val" style={{ fontSize: '10px', color: 'var(--green)', textShadow: 'var(--glow-g)' }}>ONLINE</span>
          </div>
          <div className="metric" style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', padding: '0.4rem 0.6rem' }}>
            <span className="metric-key">META SYNC</span>
            <span className="metric-val" style={{ fontSize: '10px', color: 'var(--green)', textShadow: 'var(--glow-g)' }}>ACTIVE</span>
          </div>
        </div>

        <div style={{ width: '100%', marginBottom: '1rem' }}>
          <div style={{ fontSize: '8px', letterSpacing: '.2em', color: 'rgba(0,245,255,.4)', marginBottom: '6px' }}>VOICE PROTOCOL</div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className={`btn ${voice === 'Fenrir' ? 'on' : ''}`} 
              onClick={() => setVoice('Fenrir')} 
              disabled={isConnected} 
              style={{ flex: 1, padding: '0.5rem', fontSize: '10px' }}
            >
              FENRIR [M]
            </button>
            <button 
              className={`btn ${voice === 'Kore' ? 'on' : ''}`} 
              onClick={() => setVoice('Kore')} 
              disabled={isConnected} 
              style={{ flex: 1, padding: '0.5rem', fontSize: '10px' }}
            >
              KORE [F]
            </button>
          </div>
        </div>

        <div style={{ width: '100%', marginBottom: '1rem' }}>
          <div style={{ fontSize: '8px', letterSpacing: '.2em', color: 'rgba(0,245,255,.4)', marginBottom: '6px' }}>CUSTOM API CONFIG (OPTIONAL)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input 
              type="password" 
              className="custom-api-input" 
              placeholder="Enter Custom API Key" 
              value={customApiKeyInput}
              onChange={(e) => setCustomApiKeyInput(e.target.value)}
              disabled={isConnected}
            />
            <input 
              type="text" 
              className="custom-api-input" 
              placeholder="Custom Base URL (e.g. https://api.openai.com/v1)" 
              value={customBaseUrlInput}
              onChange={(e) => setCustomBaseUrlInput(e.target.value)}
              disabled={isConnected}
            />
          </div>
        </div>

        <div className="btn-wrap" style={{ flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className={`btn main-action ${isConnected ? 'on' : ''}`} 
              id="mainBtn" 
              onClick={() => isConnected ? disconnect() : connect(voice, customApiKeyInput, customBaseUrlInput)}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              style={{ flex: 2 }}
            >
              {isConnected ? 'DEACTIVATE' : 'ACTIVATE'}
            </button>
            <button 
              className={`btn main-action ${isScreenSharing ? 'on' : ''}`} 
              onClick={() => isScreenSharing ? stopScreenShare() : startScreenShare()}
              disabled={!isConnected}
              style={{ flex: 1, padding: '1rem 0.5rem', fontSize: '10px', borderColor: isScreenSharing ? 'var(--green)' : 'var(--cyan)' }}
            >
              {isScreenSharing ? 'STOP SCREEN' : 'SHARE SCREEN'}
            </button>
          </div>
          
          <div style={{ textAlign: 'center', fontSize: '8px', color: 'rgba(0,245,255,.5)', letterSpacing: '1px' }}>
            [CTRL + SPACE] OR LONG-PRESS TO TOGGLE
          </div>

          <div className="sub-controls">
            <button className="btn sub-btn" onClick={handleSetApiKey}>
              SET PLATFORM KEY
            </button>
            <button className="btn sub-btn" onClick={toggleOverlayMode} style={{ borderColor: 'rgba(255,208,0,.5)', color: 'rgba(255,208,0,.8)' }}>
              {isOverlayMode ? 'EXIT OVERLAY' : 'DISPLAY OVER APPS'}
            </button>
            <button className="btn sub-btn" onClick={requestAllPermissions} style={{ borderColor: 'rgba(255,0,200,.5)', color: 'rgba(255,0,200,.8)' }}>
              SYSTEM OVERRIDE
            </button>
          </div>
        </div>

        <div className="footer">
          <span>SYS-ID: NX-7429</span>
          <span id="footerStatus">{customApiKeyInput ? 'MANUAL KEY LOADED' : hasCustomKey ? 'CUSTOM KEY LOADED' : 'PLATFORM KEY LOADED'}</span>
          <span>BUILD 3.0.0-AI</span>
        </div>
      </div>
      )}
    </div>
  );
}
