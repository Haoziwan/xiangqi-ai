const ENGINES_PATH = '/engines/xiangqi/';

let engine: any = null;
let isReady = false;
let messageQueue: string[] = [];

if (typeof SharedArrayBuffer === 'undefined') {
  self.postMessage({ 
    type: 'stderr', 
    data: 'Error: SharedArrayBuffer is not available. Please enable Cross-Origin Isolation (COOP/COEP) in your server configuration.' 
  });
}

// Pre-load the script
const fullEnginePath = new URL(ENGINES_PATH + 'pikafish.js', self.location.origin).href;
(self as any).importScripts(fullEnginePath);

async function initEngine() {
  try {
    // Fetch NNUE parts to bypass Cloudflare 25MB limit
    const p1Url = new URL(ENGINES_PATH + 'pikafish.nnue.part1', self.location.origin).href;
    const p2Url = new URL(ENGINES_PATH + 'pikafish.nnue.part2', self.location.origin).href;
    
    const [p1, p2] = await Promise.all([
      fetch(p1Url).then(r => r.arrayBuffer()),
      fetch(p2Url).then(r => r.arrayBuffer())
    ]);
    
    // Combine into a single blob
    const nnueBlob = new Blob([p1, p2], { type: 'application/octet-stream' });
    const nnueUrl = URL.createObjectURL(nnueBlob);
    
    const m = await (self as any).Pikafish({
      mainScriptUrlOrBlob: fullEnginePath,
      locateFile: (path: string) => {
        const fullPrefix = new URL(ENGINES_PATH, self.location.origin).href;
        if (path.endsWith('.wasm')) return fullPrefix + 'pikafish.wasm';
        if (path.endsWith('.nnue')) return nnueUrl;
        if (path.endsWith('.data')) return fullPrefix + 'pikafish.data';
        return path;
      },
      onReceiveStdout: (text: string) => {
        self.postMessage({ type: 'stdout', data: text });
      },
      onReceiveStderr: (text: string) => {
        self.postMessage({ type: 'stderr', data: text });
      },
      arguments: ['--evalfile=pikafish.nnue']
    });

    engine = m;
    isReady = true;
    self.postMessage({ type: 'ready' });
    
    // Process any queued commands
    while (messageQueue.length > 0) {
      const cmd = messageQueue.shift();
      if (cmd) engine.sendCommand(cmd);
    }
  } catch (err) {
    self.postMessage({ type: 'stderr', data: 'Error loading engine: ' + err });
  }
}

initEngine();

self.onmessage = (e: MessageEvent) => {
  const { type, data } = e.data;
  
  if (type === 'command') {
    if (isReady && engine) {
      engine.sendCommand(data);
    } else {
      messageQueue.push(data);
    }
  }
};
