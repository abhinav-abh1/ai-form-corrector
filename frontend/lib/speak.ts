let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
let speakTimeout: ReturnType<typeof setTimeout> | null = null;

function stopKeepAlive() {
  if (keepAliveTimer !== null) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

function startKeepAlive(synth: SpeechSynthesis) {
  stopKeepAlive();

  keepAliveTimer = setInterval(() => {
    if (synth.speaking) {
      synth.pause();
      synth.resume();
    } else {
      stopKeepAlive();
    }
  }, 9000);
}

export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }

  const synth = window.speechSynthesis;

  if (speakTimeout !== null) {
    clearTimeout(speakTimeout);
    speakTimeout = null;
  }

  const doSpeak = () => {
    synth.cancel();

    speakTimeout = setTimeout(() => {
      speakTimeout = null;

      const utterance = new SpeechSynthesisUtterance(text);

      const voices = synth.getVoices();
      const preferred =
        voices.find((v) => v.lang.startsWith("en") && v.localService) ||
        voices.find((v) => v.lang.startsWith("en")) ||
        voices[0];

      if (preferred) {
        utterance.voice = preferred;
      }

      utterance.rate = 1.05;
      utterance.volume = 1;
      utterance.pitch = 1;

      utterance.onend = stopKeepAlive;
      utterance.onerror = (event) => {
        console.error("Speech error:", event.error);
        stopKeepAlive();
      };

      if (synth.paused) {
        synth.resume();
      }

      synth.speak(utterance);
      startKeepAlive(synth);
    }, 30);
  };

  if (synth.getVoices().length === 0) {

    let alreadyStarted = false;
    const runOnce = () => {
      if (alreadyStarted) return;
      alreadyStarted = true;
      doSpeak();
    };

    const handler = () => {
      synth.removeEventListener("voiceschanged", handler);
      runOnce();
    };
    synth.addEventListener("voiceschanged", handler);
    setTimeout(runOnce, 200);
  } else {
    doSpeak();
  }
}