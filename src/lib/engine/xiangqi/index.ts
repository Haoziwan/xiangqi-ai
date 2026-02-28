"use client";

export type XiangqiMove = {
  from: { r: number; c: number };
  to: { r: number; c: number };
};

export class XiangqiEngine {
  private worker: Worker | null = null;
  private onMoveCallback: ((move: XiangqiMove) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private isSearching = false;

  constructor() {
    this.init();
  }

  public onError(callback: (error: string) => void) {
    this.onErrorCallback = callback;
  }

  private init() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'classic' });
    this.worker.onmessage = (e) => {
      const { type, data } = e.data;
      if (type === 'stdout') {
        this.handleMessage(data);
      } else if (type === 'stderr') {
        if (this.onErrorCallback) this.onErrorCallback(data);
      } else if (type === 'ready') {
        this.sendCommand('uci');
      }
    };
  }

  private handleMessage(text: string) {
    if (text.startsWith('bestmove')) {
      const parts = text.split(' ');
      const moveStr = parts[1]; // e.g., "e2e4"
      if (moveStr && moveStr !== '(none)') {
        const move = this.parseUCIMove(moveStr);
        if (this.onMoveCallback) {
          this.onMoveCallback(move);
        }
      }
      this.isSearching = false;
    }
  }

  private sendCommand(cmd: string) {
    this.worker?.postMessage({ type: 'command', data: cmd });
  }

  private currentDifficulty = 'medium';

  public setDifficulty(level: string) {
    this.currentDifficulty = level;
    const config: Record<string, { skill: number, threads: number, hash: number }> = {
      'easy': { skill: 0, threads: 1, hash: 16 },
      'medium': { skill: 5, threads: 1, hash: 16 },
      'hard': { skill: 10, threads: 2, hash: 32 },
      'expert': { skill: 15, threads: 2, hash: 32 },
      'master': { skill: 20, threads: 4, hash: 64 }
    };
    const settings = config[level] || config['medium'];
    this.sendCommand(`setoption name Skill Level value ${settings.skill}`);
    this.sendCommand(`setoption name Threads value ${settings.threads}`);
    this.sendCommand(`setoption name Hash value ${settings.hash}`);
  }

  public findBestMove(board: (string | null)[][], turn: 'red' | 'black', callback: (move: XiangqiMove) => void) {
    if (this.isSearching) return;
    this.isSearching = true;
    this.onMoveCallback = callback;

    const fen = this.boardToFen(board, turn);
    this.sendCommand(`position fen ${fen}`);
    
    // Depth based on difficulty
    const depths: Record<string, number> = {
      'easy': 5,
      'medium': 10,
      'hard': 14,
      'expert': 18,
      'master': 20
    };
    const depth = depths[this.currentDifficulty] || 10;
    this.sendCommand(`go depth ${depth}`);
  }

  private boardToFen(board: (string | null)[][], turn: 'red' | 'black'): string {
    let fen = "";
    for (let r = 0; r < 10; r++) {
      let empty = 0;
      for (let c = 0; c < 9; c++) {
        const p = board[r][c];
        if (p) {
          if (empty > 0) fen += empty;
          empty = 0;
          fen += p;
        } else {
          empty++;
        }
      }
      if (empty > 0) fen += empty;
      if (r < 9) fen += "/";
    }
    fen += ` ${turn === 'red' ? 'w' : 'b'} - - 0 1`;
    return fen;
  }

  private parseUCIMove(moveStr: string): XiangqiMove {
    // a0 is bottom-left (row 9, col 0)
    // i9 is top-right (row 0, col 8)
    const fromCol = moveStr.charCodeAt(0) - 'a'.charCodeAt(0);
    const fromRow = 9 - parseInt(moveStr[1]);
    const toCol = moveStr.charCodeAt(2) - 'a'.charCodeAt(0);
    const toRow = 9 - parseInt(moveStr[3]);

    return {
      from: { r: fromRow, c: fromCol },
      to: { r: toRow, c: toCol }
    };
  }

  public terminate() {
    this.worker?.terminate();
  }
}
