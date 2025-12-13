const socket = io();
// Compatibility wrappers for older browsers / WebViews where
// `navigator.mediaDevices` may be undefined.
function getUserMediaCompat(constraints) {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    return navigator.mediaDevices.getUserMedia(constraints);
  }
  const getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
  if (getUserMedia) {
    return new Promise((resolve, reject) => getUserMedia.call(navigator, constraints, resolve, reject));
  }
  return Promise.reject(new Error('getUserMedia is not supported in this browser'));
}

function enumerateDevicesCompat() {
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    return navigator.mediaDevices.enumerateDevices();
  }
  // Older API: MediaStreamTrack.getSources (deprecated) — wrap if available
  const g = window.MediaStreamTrack && MediaStreamTrack.getSources;
  if (typeof g === 'function') {
    return new Promise((resolve) => {
      MediaStreamTrack.getSources((sources) => resolve(sources.map(s => ({ kind: s.kind, deviceId: s.id, label: s.label }))))
    });
  }
  return Promise.resolve([]);
}
const statusText = document.getElementById('statusText');

function setStatus(msg) {
  console.log(msg);
  if (statusText) statusText.textContent = msg;
}

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const hangupBtn = document.getElementById('hangupBtn');
const roomInput = document.getElementById('roomInput');
const startMediaBtn = document.getElementById('startMediaBtn');
const audioFileInput = document.getElementById('audioFileInput');
const loopAudioCheckbox = document.getElementById('loopAudioCheckbox');
const playAudioBtn = document.getElementById('playAudioBtn');

let room = null;
let isInitiator = false;
let localStream = null;
let pc = null;
let audioElement = null;
let selectedAudioFile = null;
let isAudioPlaying = false;

const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

createBtn.onclick = async () => {
  room = roomInput.value || Math.random().toString(36).substring(2, 9);
  setStatus(`Creating room ${room}...`);
  socket.emit('create or join', room);
};

joinBtn.onclick = async () => {
  room = roomInput.value;
  if (!room) return alert('Enter a room to join');
  setStatus(`Joining room ${room}...`);
  socket.emit('create or join', room);
};

hangupBtn.onclick = () => {
  if (pc) pc.close();
  pc = null;
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    localVideo.srcObject = null;
  }
  if (audioElement) {
    audioElement.pause();
    audioElement.srcObject = null;
    audioElement.src = '';
    // Clean up Web Audio API resources if they exist
    if (audioElement.audioSource) {
      try {
        audioElement.audioSource.stop();
      } catch (e) {
        // Source may already be stopped
      }
      audioElement.audioSource = null;
    }
    if (audioElement.audioContext) {
      audioElement.audioContext.close();
      audioElement.audioContext = null;
    }
    audioElement = null;
  }
  remoteVideo.srcObject = null;
  hangupBtn.disabled = true;
};

async function setupAudioFileStream() {
  try {
    if (!selectedAudioFile) {
      setStatus('Please select an audio file first');
      return;
    }

    // Get video from camera first
    const videoStream = await getUserMediaCompat({ video: true });

    // Create audio element and load the file
    audioElement = new Audio();
    audioElement.src = URL.createObjectURL(selectedAudioFile);
    audioElement.loop = loopAudioCheckbox.checked;
    // Set volume to 0 instead of muting - muted tracks won't stream
    audioElement.volume = 0;

    // Don't autoplay - wait for user to click Play Audio button
    audioElement.pause();

    let audioStream;

    // Try captureStream first (Chrome, Firefox, Edge)
    if (audioElement.captureStream || audioElement.mozCaptureStream) {
      const captureStreamFn = audioElement.captureStream || audioElement.mozCaptureStream;
      audioStream = captureStreamFn.call(audioElement);
      console.log('captureStream mode - audio tracks:', audioStream.getAudioTracks().length);
      setStatus('Audio file loaded (captureStream mode)');
    } else {
      // Fallback for Safari: use Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // Create a media element source
      const source = audioContext.createMediaElementSource(audioElement);

      // Create a MediaStreamDestination to get a MediaStream
      const destination = audioContext.createMediaStreamDestination();
      source.connect(destination);

      // Don't connect to local speakers - we only want to hear the remote peer
      // source.connect(audioContext.destination);

      // Store references for cleanup
      audioElement.audioContext = audioContext;
      audioElement.audioSource = source;

      audioStream = destination.stream;
      console.log('Web Audio API mode - audio tracks:', audioStream.getAudioTracks().length);
      setStatus('Audio file loaded (Web Audio API mode)');
    }

    // Verify audio track is enabled
    audioStream.getAudioTracks().forEach((track, i) => {
      console.log(`Audio track ${i}:`, {
        id: track.id,
        kind: track.kind,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      });
    });

    // Combine audio from file + video from camera
    localStream = new MediaStream([
      ...audioStream.getAudioTracks(),
      ...videoStream.getVideoTracks()
    ]);

    // Display local video
    try {
      localVideo.srcObject = localStream;
    } catch (e) {
      localVideo.src = window.URL.createObjectURL(localStream);
    }

    // Enable play button
    playAudioBtn.disabled = false;

    // if a peer connection already exists, add the tracks to it
    if (pc) {
      console.log('Adding tracks to existing peer connection');
      localStream.getTracks().forEach(track => {
        console.log('Adding track:', track.kind, track.id, 'enabled:', track.enabled);
        pc.addTrack(track, localStream);
      });

      // Renegotiate if we're the initiator
      if (isInitiator && pc.signalingState === 'stable') {
        console.log('Renegotiating as initiator');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('message', { room, type: 'offer', data: offer });
      }

      setStatus('Audio ready - click Play Audio to start');
    } else {
      setStatus('Audio ready - create/join a room, then click Play Audio');
    }
  } catch (err) {
    console.error('Audio file stream error', err);
    const msg = err && (err.name || err.message) ? `${err.name || ''}: ${err.message || ''}` : String(err);
    setStatus('Could not setup audio file stream — ' + msg);
    showDiagnostics(msg, err);
  }
}

async function startLocalStream() {
  try {
    // Check if user selected audio file mode
    const audioSource = document.querySelector('input[name="audioSource"]:checked').value;

    if (audioSource === 'file') {
      await setupAudioFileStream();
      return;
    }

    // Default: microphone mode
    localStream = await getUserMediaCompat({ audio: true, video: true });
    // older browsers may return a MediaStream but not support srcObject
    try {
      localVideo.srcObject = localStream;
    } catch (e) {
      localVideo.src = window.URL.createObjectURL(localStream);
    }
    setStatus('Local media started');
    // if a peer connection already exists, add the tracks to it
    if (pc) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
      setStatus('Local tracks added to PeerConnection');
    }
  } catch (err) {
    console.error('getUserMedia error', err);
    const msg = err && (err.name || err.message) ? `${err.name || ''}: ${err.message || ''}` : String(err);
    setStatus('Could not get local media — ' + msg);
    showDiagnostics(msg, err);
  }
}

function showDiagnostics(msg, err) {
  try {
    const diag = document.getElementById('diagnostics');
    const diagText = document.getElementById('diagText');
    if (!diag || !diagText) return;
    diag.style.display = 'block';
    let out = '';
    out += `Error: ${msg}\n\n`;
    // permissions API
    const p = [];
    if (navigator.permissions && navigator.permissions.query) {
      p.push(navigator.permissions.query({ name: 'camera' }).then(r => `camera: ${r.state}`));
      p.push(navigator.permissions.query({ name: 'microphone' }).then(r => `microphone: ${r.state}`));
    } else {
      out += 'Permissions API not supported in this browser.\n';
    }
    // enumerate devices
    const devicesP = enumerateDevicesCompat().then(devs => {
      if (!devs || devs.length === 0) return 'No devices found or enumerateDevices not supported';
      const lines = devs.map(d => `${d.kind} | ${d.deviceId} | ${d.label || '<no label>'}`);
      return `Devices:\n${lines.join('\n')}`;
    }).catch(e => `enumerateDevices failed: ${e}`);

    Promise.all([...p, devicesP]).then(results => {
      out += results.join('\n') + '\n';
      if (err && err.stack) out += `\nStack:\n${err.stack}`;
      diagText.textContent = out;
    }).catch(e => {
      diagText.textContent = out + '\n(Additional diagnostics failed: ' + e + ')';
    });
  } catch (e) {
    console.warn('Diagnostics failed', e);
  }
}

function createPeerConnection() {
  pc = new RTCPeerConnection(configuration);

  pc.onicecandidate = event => {
    if (event.candidate) {
      socket.emit('message', { room, type: 'ice-candidate', data: event.candidate });
    }
  };

  pc.ontrack = event => {
    console.log('Received remote track:', event.track.kind, event.track.id);
    console.log('Track state:', {
      enabled: event.track.enabled,
      muted: event.track.muted,
      readyState: event.track.readyState
    });
    remoteVideo.srcObject = event.streams[0];
    setStatus(`Receiving ${event.track.kind} from remote peer`);
  };

  pc.onnegotiationneeded = async () => {
    console.log('Negotiation needed');
  };

  if (localStream) {
    console.log('Adding local stream tracks to peer connection');
    localStream.getTracks().forEach(track => {
      console.log('Adding track:', track.kind, track.id, 'enabled:', track.enabled);
      pc.addTrack(track, localStream);
    });
  }
}

socket.on('created', async (r) => {
  setStatus('Created room ' + r + ' (you are initiator)');
  isInitiator = true;
  // start local media only if not already started
  if (!localStream) await startLocalStream();
  createPeerConnection();
  hangupBtn.disabled = false;
});

socket.on('join', async (r) => {
  setStatus('Another peer joined room ' + r);
});

socket.on('joined', async (r) => {
  setStatus('Joined room ' + r + ' (you are not initiator)');
  isInitiator = false;
  if (!localStream) await startLocalStream();
  createPeerConnection();
  hangupBtn.disabled = false;
  // notify initiator that both are ready
  socket.emit('message', { room, type: 'ready', data: null });
});

socket.on('full', (r) => {
  alert('Room is full: ' + r);
});

socket.on('message', async (msg) => {
  const { type, data } = msg;
  setStatus('Signal message received: ' + type);
  if (type === 'ready' && isInitiator) {
    // create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('message', { room, type: 'offer', data: offer });
    setStatus('Offer sent');
  } else if (type === 'offer') {
    await pc.setRemoteDescription(new RTCSessionDescription(data));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('message', { room, type: 'answer', data: answer });
    setStatus('Answer sent');
  } else if (type === 'answer') {
    await pc.setRemoteDescription(new RTCSessionDescription(data));
    setStatus('Remote description (answer) set');
  } else if (type === 'ice-candidate') {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data));
      setStatus('Remote ICE candidate added');
    } catch (err) {
      console.error('Error adding received ice candidate', err);
    }
  }
});

socket.on('connect', () => setStatus('Socket connected: ' + socket.id));
socket.on('disconnect', () => setStatus('Socket disconnected'));

// bind start media button
if (startMediaBtn) {
  startMediaBtn.onclick = async () => {
    await startLocalStream();
  };
}

// Handle audio source radio button changes
const audioSourceRadios = document.querySelectorAll('input[name="audioSource"]');
audioSourceRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    const isFileMode = e.target.value === 'file';
    audioFileInput.style.display = isFileMode ? 'inline-block' : 'none';
    playAudioBtn.style.display = isFileMode ? 'inline-block' : 'none';
    loopAudioCheckbox.style.display = isFileMode ? 'inline' : 'none';
    document.getElementById('loopAudioLabel').style.display = isFileMode ? 'inline' : 'none';
  });
});

// Handle audio file selection
if (audioFileInput) {
  audioFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      selectedAudioFile = file;
      setStatus(`Audio file selected: ${file.name}`);
      playAudioBtn.disabled = true; // Disable until stream is set up
    }
  });
}

// Handle play/stop audio button
if (playAudioBtn) {
  playAudioBtn.addEventListener('click', async () => {
    if (!audioElement) {
      setStatus('Please set up audio first (click "Start camera & microphone")');
      return;
    }

    if (isAudioPlaying) {
      // Stop audio
      audioElement.pause();
      isAudioPlaying = false;
      playAudioBtn.textContent = 'Play Audio';
      setStatus('Audio stopped');
    } else {
      // Play audio
      try {
        await audioElement.play();
        isAudioPlaying = true;
        playAudioBtn.textContent = 'Stop Audio';
        setStatus('Audio playing - remote peer should hear it now');
      } catch (err) {
        console.error('Error playing audio', err);
        setStatus('Error playing audio: ' + err.message);
      }
    }
  });
}

// Auto-start local media when allowed: if secure origin or localhost
if ((location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  // delay a moment to allow UI to initialize
  setTimeout(() => {
    if (!localStream) {
      startLocalStream().catch(err => console.warn('Auto-start media failed', err));
    }
  }, 300);
} else {
  setStatus('On insecure origin — click "Start camera & microphone" to enable local media (or use HTTPS/ngrok).');
}
