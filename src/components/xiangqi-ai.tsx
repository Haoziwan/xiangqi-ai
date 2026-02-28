"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/context";
import { toast } from "sonner";
import { 
  RotateCcw, 
  Undo2, 
  Sword,
  Shield,
  BookOpen,
  Brain,
  Trophy,
  Lightbulb,
  UserCheck
} from "lucide-react";
import { XiangqiEngine, type XiangqiMove } from "@/lib/engine/xiangqi";

// Piece Constants
const RED_KING = 'K', RED_ADVISOR = 'A', RED_BISHOP = 'B', RED_KNIGHT = 'N', RED_ROOK = 'R', RED_CANNON = 'C', RED_PAWN = 'P';
const BLACK_KING = 'k', BLACK_ADVISOR = 'a', BLACK_BISHOP = 'b', BLACK_KNIGHT = 'n', BLACK_ROOK = 'r', BLACK_CANNON = 'c', BLACK_PAWN = 'p';

const INITIAL_BOARD = [
  [BLACK_ROOK, BLACK_KNIGHT, BLACK_BISHOP, BLACK_ADVISOR, BLACK_KING, BLACK_ADVISOR, BLACK_BISHOP, BLACK_KNIGHT, BLACK_ROOK],
  [null, null, null, null, null, null, null, null, null],
  [null, BLACK_CANNON, null, null, null, null, null, BLACK_CANNON, null],
  [BLACK_PAWN, null, BLACK_PAWN, null, BLACK_PAWN, null, BLACK_PAWN, null, BLACK_PAWN],
  [null, null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null, null],
  [RED_PAWN, null, RED_PAWN, null, RED_PAWN, null, RED_PAWN, null, RED_PAWN],
  [null, RED_CANNON, null, null, null, null, null, RED_CANNON, null],
  [null, null, null, null, null, null, null, null, null],
  [RED_ROOK, RED_KNIGHT, RED_BISHOP, RED_ADVISOR, RED_KING, RED_ADVISOR, RED_BISHOP, RED_KNIGHT, RED_ROOK],
];

const PIECE_NAMES: Record<string, { zh: string, en: string }> = {
  [RED_KING]: { zh: "帥", en: "帥" }, [RED_ADVISOR]: { zh: "仕", en: "仕" }, [RED_BISHOP]: { zh: "相", en: "相" }, [RED_KNIGHT]: { zh: "傌", en: "傌" }, [RED_ROOK]: { zh: "俥", en: "俥" }, [RED_CANNON]: { zh: "炮", en: "炮" }, [RED_PAWN]: { zh: "兵", en: "兵" },
  [BLACK_KING]: { zh: "將", en: "將" }, [BLACK_ADVISOR]: { zh: "士", en: "士" }, [BLACK_BISHOP]: { zh: "象", en: "象" }, [BLACK_KNIGHT]: { zh: "馬", en: "馬" }, [BLACK_ROOK]: { zh: "車", en: "車" }, [BLACK_CANNON]: { zh: "砲", en: "砲" }, [BLACK_PAWN]: { zh: "卒", en: "卒" },
};

const STORAGE_KEY = 'xiangqi_game_state';

export default function XiangqiAI() {
  const { t, language } = useI18n();
  
  // Initialize state from local storage or defaults
  const [board, setBoard] = useState<(string | null)[][]>(() => INITIAL_BOARD.map(row => [...row]));
  const [turn, setTurn] = useState<'red' | 'black'>('red');
  const [history, setHistory] = useState<(string | null)[][][]>([]);
  const [winner, setWinner] = useState<'red' | 'black' | null>(null);
  const [lastMove, setLastMove] = useState<{from: {r: number, c: number}, to: {r: number, c: number}} | null>(null);
  const [difficulty, setDifficulty] = useState('hard');
  const [playerSide, setPlayerSide] = useState<'red' | 'black'>('red');
  const [isCheck, setIsCheck] = useState(false);

  const [selected, setSelected] = useState<{ r: number, c: number } | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [hint, setHint] = useState<XiangqiMove | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showGameOver, setShowGameOver] = useState(false);
  const engineRef = useRef<XiangqiEngine | null>(null);

  // Load from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (state.board) setBoard(state.board);
        if (state.turn) setTurn(state.turn);
        if (state.history) setHistory(state.history);
        if (state.winner !== undefined) setWinner(state.winner);
        if (state.lastMove) setLastMove(state.lastMove);
        if (state.difficulty) setDifficulty(state.difficulty);
        if (state.playerSide) setPlayerSide(state.playerSide);
        if (state.isCheck !== undefined) setIsCheck(state.isCheck);
        if (state.showGameOver !== undefined) setShowGameOver(state.showGameOver);
        else if (state.winner) setShowGameOver(true);
      } catch (e) {
        console.error("Failed to load Xiangqi state", e);
      }
    }
    setIsInitialized(true);
  }, []);

  // Save to LocalStorage
  useEffect(() => {
    if (!isInitialized) return;
    const state = {
      board,
      turn,
      history,
      winner,
      lastMove,
      difficulty,
      playerSide,
      isCheck,
      showGameOver
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [board, turn, history, winner, lastMove, difficulty, playerSide, isCheck, isInitialized]);

  useEffect(() => {
    const engine = new XiangqiEngine();
    engine.onError((err) => {
      console.error("Xiangqi AI Error:", err);
      toast.error(t("tools.xiangqi.engine_error") || "AI Engine Error", {
        description: err.includes("SharedArrayBuffer") 
          ? "Browsers require special isolation headers for this AI to work. Please check server config."
          : err
      });
    });
    engineRef.current = engine;
    return () => {
      engineRef.current?.terminate();
    };
  }, [t]);

  useEffect(() => {
    if (engineRef.current) {
        engineRef.current.setDifficulty(difficulty);
    }
  }, [difficulty]);

  const isRed = (p: string | null) => p && p === p.toUpperCase();
  const isBlack = (p: string | null) => p && p === p.toLowerCase();

  const isKingSafe = useCallback((currentBoard: (string | null)[][], color: 'red' | 'black') => {
    let kingR = -1, kingC = -1;
    const kingChar = color === 'red' ? 'K' : 'k';
    
    // Find King
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        if (currentBoard[r][c] === kingChar) {
          kingR = r; kingC = c; break;
        }
      }
      if (kingR !== -1) break;
    }

    if (kingR === -1) return true; // Should not happen

    // Check if any opponent piece can attack the king
    const oppColor = color === 'red' ? 'black' : 'red';
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = currentBoard[r][c];
        if (p && (oppColor === 'red' ? isRed(p) : isBlack(p))) {
          if (isValidMoveInternal(currentBoard, r, c, kingR, kingC, p, true)) return false;
        }
      }
    }
    
    // Check Fly King (Facing Kings)
    const otherKingChar = color === 'red' ? 'k' : 'K';
    let otherKingR = -1, otherKingC = -1;
    for (let r = 0; r < 10; r++) {
      if (currentBoard[r][kingC] === otherKingChar) {
        otherKingR = r; otherKingC = kingC; break;
      }
    }
    if (otherKingC === kingC) {
      let blocked = false;
      const start = Math.min(kingR, otherKingR);
      const end = Math.max(kingR, otherKingR);
      for (let r = start + 1; r < end; r++) {
        if (currentBoard[r][kingC]) { blocked = true; break; }
      }
      if (!blocked) return false;
    }

    return true;
  }, []);

  const isValidMoveInternal = useCallback((currentBoard: (string | null)[][], fromR: number, fromC: number, toR: number, toC: number, p: string, ignoreKingSafety = false) => {
    const target = currentBoard[toR][toC];
    if (isRed(p) && isRed(target)) return false;
    if (isBlack(p) && isBlack(target)) return false;

    const dr = toR - fromR;
    const dc = toC - fromC;
    const absDr = Math.abs(dr);
    const absDc = Math.abs(dc);

    let moveValid = false;
    switch (p.toUpperCase()) {
      case 'K': // King
        moveValid = (absDr + absDc === 1) && (toC >= 3 && toC <= 5) && 
                    (isRed(p) ? (toR >= 7 && toR <= 9) : (toR >= 0 && toR <= 2));
        break;
      case 'A': // Advisor
        moveValid = (absDr === 1 && absDc === 1) && (toC >= 3 && toC <= 5) && 
                    (isRed(p) ? (toR >= 7 && toR <= 9) : (toR >= 0 && toR <= 2));
        break;
      case 'B': // Bishop
        if (absDr === 2 && absDc === 2) {
          if (isRed(p) && toR < 5) moveValid = false;
          else if (isBlack(p) && toR > 4) moveValid = false;
          else moveValid = !currentBoard[fromR + dr/2][fromC + dc/2];
        }
        break;
      case 'N': // Knight
        if ((absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2)) {
          if (absDr === 2) moveValid = !currentBoard[fromR + dr/2][fromC];
          else moveValid = !currentBoard[fromR][fromC + dc/2];
        }
        break;
      case 'R': // Rook
        if (dr === 0 || dc === 0) {
          const stepR = dr === 0 ? 0 : dr / absDr;
          const stepC = dc === 0 ? 0 : dc / absDc;
          let blocked = false;
          for (let i = 1; i < Math.max(absDr, absDc); i++) {
            if (currentBoard[fromR + i * stepR][fromC + i * stepC]) { blocked = true; break; }
          }
          moveValid = !blocked;
        }
        break;
      case 'C': // Cannon
        if (dr === 0 || dc === 0) {
          let count = 0;
          const cStepR = dr === 0 ? 0 : dr / absDr;
          const cStepC = dc === 0 ? 0 : dc / absDc;
          for (let i = 1; i < Math.max(absDr, absDc); i++) {
            if (currentBoard[fromR + i * cStepR][fromC + i * cStepC]) count++;
          }
          moveValid = !target ? (count === 0) : (count === 1);
        }
        break;
      case 'P': // Pawn
        if (isRed(p)) {
          moveValid = (dr === -1 && dc === 0) || (fromR < 5 && absDc === 1 && dr === 0);
        } else {
          moveValid = (dr === 1 && dc === 0) || (fromR > 4 && absDc === 1 && dr === 0);
        }
        break;
    }

    if (!moveValid) return false;
    if (ignoreKingSafety) return true;

    // Simulation for king safety
    const tempBoard = currentBoard.map(row => [...row]);
    tempBoard[toR][toC] = p;
    tempBoard[fromR][fromC] = null;
    return isKingSafe(tempBoard, isRed(p) ? 'red' : 'black');
  }, [isKingSafe]);

  const isValidMove = useCallback((currentBoard: (string | null)[][], fromR: number, fromC: number, toR: number, toC: number, p: string) => {
    return isValidMoveInternal(currentBoard, fromR, fromC, toR, toC, p);
  }, [isValidMoveInternal]);

  const hasLegalMoves = useCallback((currentBoard: (string | null)[][], color: 'red' | 'black') => {
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = currentBoard[r][c];
        if (p && (color === 'red' ? isRed(p) : isBlack(p))) {
          for (let tr = 0; tr < 10; tr++) {
            for (let tc = 0; tc < 9; tc++) {
              if (isValidMoveInternal(currentBoard, r, c, tr, tc, p)) return true;
            }
          }
        }
      }
    }
    return false;
  }, [isValidMoveInternal]);

  const movePiece = useCallback((fromR: number, fromC: number, toR: number, toC: number) => {
    const newBoard = board.map(row => [...row]);
    const piece = newBoard[fromR][fromC];
    const target = newBoard[toR][toC];

    setHistory(prev => [...prev, board.map(row => [...row])]);
    newBoard[toR][toC] = piece;
    newBoard[fromR][fromC] = null;
    setBoard(newBoard);
    setLastMove({ from: {r: fromR, c: fromC}, to: {r: toR, c: toC} });

    const oppColor = turn === 'red' ? 'black' : 'red';
    const oppInCheck = !isKingSafe(newBoard, oppColor);
    setIsCheck(oppInCheck);

    // Checkmate/Stalemate detection
    if (!hasLegalMoves(newBoard, oppColor)) {
      setWinner(turn);
      setShowGameOver(true);
      const winMsg = oppInCheck 
        ? (t("tools.xiangqi.win")?.replace("{player}", turn === 'red' ? t("tools.xiangqi.red") : t("tools.xiangqi.black")) || "Checkmate!")
        : (t("tools.xiangqi.stalemateWin")?.replace("{player}", turn === 'red' ? t("tools.xiangqi.red") : t("tools.xiangqi.black")) || "Stalemate!");
      
      toast.success(winMsg, {
        icon: <Trophy className="w-5 h-5 text-yellow-500" />
      });
      return;
    }

    setTurn(oppColor);
    setHint(null);
  }, [board, turn, t, isKingSafe, hasLegalMoves]);

  const handleSquareClick = (r: number, c: number) => {
    if (winner || isThinking || turn !== playerSide) return;

    if (selected) {
      if (isValidMove(board, selected.r, selected.c, r, c, board[selected.r][selected.c]!)) {
        movePiece(selected.r, selected.c, r, c);
        setSelected(null);
      } else if (board[r][c] && (turn === 'red' ? isRed(board[r][c]) : isBlack(board[r][c]))) {
        setSelected({ r, c });
      } else {
        setSelected(null);
      }
    } else {
      if (board[r][c] && (turn === 'red' ? isRed(board[r][c]) : isBlack(board[r][c]))) {
        setSelected({ r, c });
      }
    }
  };

  const aiAction = useCallback(() => {
    if (winner || isThinking || turn === playerSide || !engineRef.current) return;
    setIsThinking(true);

    engineRef.current.findBestMove(board, turn, (move) => {
      movePiece(move.from.r, move.from.c, move.to.r, move.to.c);
      setIsThinking(false);
    });
  }, [board, winner, isThinking, turn, movePiece, playerSide]);

  useEffect(() => {
    if (isInitialized && turn !== playerSide) aiAction();
  }, [turn, aiAction, playerSide, isInitialized]);

  const resetGame = () => {
    setBoard(INITIAL_BOARD.map(row => [...row]));
    setTurn('red');
    setWinner(null);
    setHistory([]);
    setSelected(null);
    setLastMove(null);
    setIsThinking(false);
    setHint(null);
    setIsCheck(false);
    localStorage.removeItem(STORAGE_KEY);
  };

  const getHint = () => {
    if (winner || isThinking || !engineRef.current) return;
    setIsThinking(true);
    engineRef.current.findBestMove(board, turn, (move) => {
        setHint(move);
        setIsThinking(false);
    });
  }

  const undoMove = () => {
    if (history.length === 0 || isThinking) return;
    
    // If game ended, undo 1 move. If AI played, undo 2 moves (AI + Player)
    const stepsToUndo = (winner !== null || history.length === 1) ? 1 : 2;
    const targetIndex = Math.max(0, history.length - stepsToUndo);
    
    const prevBoard = history[targetIndex];
    setBoard(prevBoard);
    setHistory(history.slice(0, targetIndex));
    setTurn(playerSide);
    setWinner(null);
    setShowGameOver(false);
    setSelected(null);
    setLastMove(null);
    setIsCheck(!isKingSafe(prevBoard, playerSide));
  };

  return (
    <div className="flex flex-col min-h-screen bg-black">
      {/* Top Header - Back Link only */}
      <div className="fixed top-4 left-4 z-50">
        <a 
          href="https://freetools.me/" 
          className="inline-flex items-center gap-2 text-xs font-bold text-zinc-500 hover:text-white transition-all bg-zinc-900/40 hover:bg-zinc-800 px-4 py-2 rounded-full border border-white/5"
        >
          <RotateCcw className="w-3 h-3" />
          返回 DevToolbox 主页
        </a>
      </div>

      <div className="flex-1 flex flex-col justify-start md:justify-center items-center pt-16 md:pt-12 md:pb-12 w-full">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 max-w-7xl w-full px-4 items-stretch justify-center">
          
          {/* LEFT: Chessboard - Scaled Up 10% */}
          <div className="flex justify-center items-center">
            <div 
              className="rounded-lg shadow-[0_0_60px_rgba(0,0,0,0.7)] border-[10px] sm:border-[12px] border-[#3e2723] w-full max-w-[500px] sm:w-[500px] ring-2 ring-white/5 relative overflow-hidden h-fit select-none"
              style={{ 
                aspectRatio: "9/10",
                backgroundImage: "url('./engines/xiangqi/board.png')",
                backgroundSize: "100% 100%",
                backgroundColor: "#ceae7f",
                boxShadow: "inset 0 0 100px rgba(0,0,0,0.1), 0 0 60px rgba(0,0,0,0.7)"
              }}
            >
              <div className="relative w-full h-full">
                <div className="grid grid-cols-9 grid-rows-10 h-full w-full relative z-10">
                  {board.map((row, r) => 
                    row.map((piece, c) => (
                      <div 
                        key={`${r}-${c}`}
                        onClick={() => handleSquareClick(r, c)}
                        className="flex items-center justify-center cursor-pointer relative"
                      >
                         {/* Last Move Indicators */}
                         {lastMove?.from.r === r && lastMove.from.c === c && (
                            <div className="absolute inset-0 sm:inset-1 border-2 border-dashed border-red-500/60 rounded-xl z-30 bg-red-500/5" />
                         )}
                         {lastMove?.to.r === r && lastMove.to.c === c && (
                            <div className="absolute inset-2 sm:inset-3 border-2 border-red-500/80 rounded-lg z-30 opacity-60" />
                         )}

                         {/* Hint Indicators */}
                         {hint?.from.r === r && hint.from.c === c && (
                            <div className="absolute inset-0 sm:inset-1 border-4 border-green-500 rounded-xl z-40 animate-pulse bg-green-500/10">
                               <span className="absolute -top-3 -left-2 bg-green-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-lg ring-1 ring-white/20 whitespace-nowrap">推荐起点</span>
                            </div>
                         )}
                         {hint?.to.r === r && hint.to.c === c && (
                            <div className="absolute inset-0 sm:inset-1 border-4 border-dashed border-emerald-600 rounded-xl z-40 animate-pulse bg-emerald-600/5">
                               <span className="absolute -top-3 -left-2 bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-lg ring-1 ring-white/20 whitespace-nowrap">推荐落点</span>
                            </div>
                         )}

                         {/* Selection Guide */}
                         {selected && isValidMove(board, selected.r, selected.c, r, c, board[selected.r][selected.c]!) && (
                            <div className="w-5 h-5 rounded-full border-2 border-dashed border-black/10 z-0 animate-ping" />
                         )}

                         {/* Piece Rendering - Matches Screenshot Thin Look */}
                         {piece && (
                            <div 
                              className={`w-[85%] h-[85%] flex items-center justify-center aspect-square z-20 
                                ${isCheck && piece.toUpperCase() === 'K' && (isRed(piece) ? turn === 'red' : turn === 'black') ? 'animate-[pulse_1s_infinite] ring-4 ring-red-600 rounded-full bg-red-600/20' : ''}`} 
                              style={{ 
                                aspectRatio: '1/1',
                                fontSize: 'min(5.5vw, 29px)'
                              }}
                            >
                               <div 
                                  className={`
                                    w-full h-full rounded-full flex items-center justify-center 
                                    transition-all duration-300 relative select-none
                                    ${selected?.r === r && selected?.c === c ? 'scale-110 -translate-y-2 drop-shadow-[0_20px_20px_rgba(0,0,0,0.8)] z-50 ring-2 ring-emerald-400' : 'drop-shadow-lg z-20'}
                                  `}
                                  style={{
                                    backgroundColor: isRed(piece) ? '#991111' : '#111111', 
                                    padding: '0.12em',
                                    aspectRatio: '1/1'
                                  }}
                               >
                                  <div 
                                    className="w-full h-full rounded-full flex items-center justify-center relative shadow-inner"
                                    style={{
                                      backgroundColor: '#e6d2b5', 
                                    }}
                                  >
                                     <span 
                                       className="relative font-black z-10 select-none flex items-center justify-center"
                                       style={{
                                         fontFamily: '"KaiTi", "STKaiti", "LiSu", "楷体", serif',
                                         color: isRed(piece) ? '#cc0000' : '#1a1a1a',
                                         fontSize: '1em', 
                                         fontWeight: '900',
                                         lineHeight: '1',
                                         width: '100%',
                                         height: '100%',
                                         textAlign: 'center'
                                       }}
                                     >
                                        {PIECE_NAMES[piece].zh}
                                     </span>
                                  </div>
                               </div>
                            </div>
                         )}
                      </div>
                    ))
                  )}
                </div>

                {/* Overlays */}
                {isCheck && !winner && (
                  <div className="absolute inset-0 z-[60] flex items-center justify-center pointer-events-none">
                     <div 
                        className="bg-red-600/90 text-white px-10 py-4 shadow-[0_0_50px_rgba(220,38,38,0.5)] rounded-lg text-6xl italic font-black animate-pulse"
                        style={{ fontFamily: '"KaiTi", serif' }}
                     >
                        {t("tools.xiangqi.check")}
                     </div>
                  </div>
                )}
                
                {winner && showGameOver && (
                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-[100] bg-black/40 backdrop-blur-md py-8 flex flex-col items-center justify-center text-white animate-in zoom-in slide-in-from-top-10 duration-500 border-y border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.8)] pointer-events-auto">
                     <Trophy className="w-16 h-16 text-yellow-500 mb-4 drop-shadow-[0_0_20px_rgba(234,179,8,0.5)] animate-bounce" />
                     <h2 className="text-4xl font-black mb-8 italic uppercase tracking-tighter">
                        {winner === 'red' ? t("tools.xiangqi.red") : t("tools.xiangqi.black")} 胜
                     </h2>
                     <div className="flex gap-4">
                        <Button size="lg" variant="secondary" className="h-12 rounded-xl font-bold px-8 text-sm" onClick={() => setShowGameOver(false)}>
                           {t("tools.xiangqi.viewBoard")}
                        </Button>
                        <Button size="lg" variant="destructive" className="h-12 rounded-xl font-black px-10 text-lg shadow-lg shadow-red-900/40" onClick={resetGame}>
                           {t("tools.xiangqi.newGame")}
                        </Button>
                     </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Control Panel - Scaled Up 10% */}
          <div className="flex flex-col w-full max-w-[420px] h-full">
             <div className="bg-[#111111] rounded-[2rem] p-8 shadow-2xl border border-white/5 flex flex-col gap-8 h-full min-h-[550px]">
                {/* Title */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3 text-3xl font-black italic tracking-tighter uppercase text-white">
                    <Sword className="w-7 h-7" />
                    中国象棋 AI - Pikafish Online
                  </div>
                  <div className="text-[10px] uppercase font-bold tracking-[0.35em] text-zinc-600">皮卡鱼在线 · 经典博弈 · 智慧对战</div>
                </div>

                {/* Turn Info */}
                <div className="bg-zinc-900/50 rounded-2xl p-5 border border-white/5 flex items-center gap-5">
                   <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-3xl shadow-2xl transition-all duration-500 border-b-4 ${turn === 'red' ? 'bg-white text-red-600 border-zinc-200' : 'bg-black text-white border-zinc-800 rotate-180'}`}>
                      {turn === 'red' ? '帅' : '将'}
                   </div>
                   <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">{t("tools.xiangqi.activeSide")}</span>
                      <span className="font-black text-2xl tracking-tighter uppercase text-white mt-1">
                        {isThinking ? 'AI 正在思考...' : (turn === 'red' ? '红方回合' : '黑方回合')}
                      </span>
                   </div>
                </div>

                {/* Player Side Selection */}
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[11px] uppercase font-black text-zinc-500">
                      <UserCheck className="w-4 h-4" />
                      玩家执子
                    </div>
                    <div className="bg-zinc-800/80 px-2.5 py-0.5 rounded-full text-[9px] font-black text-emerald-400 border border-emerald-500/20 uppercase tracking-widest">{playerSide === 'red' ? '红方' : '黑方'}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      variant={playerSide === 'red' ? 'default' : 'secondary'} 
                      className={`h-12 text-xs font-black rounded-xl transition-all ${playerSide === 'red' ? 'bg-emerald-800 hover:bg-emerald-700 text-white' : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-500'}`}
                      onClick={() => { setPlayerSide('red'); if (history.length === 0) resetGame(); }}
                      disabled={isThinking}
                    >
                      红方 (先手)
                    </Button>
                    <Button 
                      variant={playerSide === 'black' ? 'default' : 'secondary'} 
                      className={`h-12 text-xs font-black rounded-xl transition-all ${playerSide === 'black' ? 'bg-emerald-800 hover:bg-emerald-700 text-white' : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-500'}`}
                      onClick={() => { setPlayerSide('black'); if (history.length === 0) resetGame(); }}
                      disabled={isThinking}
                    >
                      黑方 (后手)
                    </Button>
                  </div>
                </div>

                {/* Intelligence Level */}
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[11px] uppercase font-black text-zinc-500">
                      <Brain className="w-4 h-4" />
                      AI 难度等级
                    </div>
                    <div className="bg-zinc-800/80 px-2.5 py-0.5 rounded-full text-[9px] font-black text-emerald-400 border border-emerald-500/20 uppercase">
                      难度 {difficulty === 'easy' ? '1' : difficulty === 'medium' ? '2' : difficulty === 'hard' ? '3' : difficulty === 'expert' ? '4' : '5'}
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { id: 'easy', name: '1' },
                      { id: 'medium', name: '2' },
                      { id: 'hard', name: '3' },
                      { id: 'expert', name: '4' },
                      { id: 'master', name: '5' }
                    ].map((lv) => (
                      <Button 
                        key={lv.id} 
                        variant={difficulty === lv.id ? 'default' : 'secondary'} 
                        className={`h-10 px-0 text-sm font-black rounded-xl transition-all ${difficulty === lv.id ? 'bg-emerald-800 hover:bg-emerald-700 text-white' : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-600'}`}
                        onClick={() => setDifficulty(lv.id)}
                        disabled={isThinking}
                      >
                        {lv.name}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Undo & Hint Buttons */}
                <div className="grid grid-cols-2 gap-4 mt-auto pt-4">
                  <Button variant="secondary" className="h-14 rounded-xl font-black bg-zinc-900/60 border border-white/5 hover:bg-zinc-800 text-zinc-400 text-sm" onClick={undoMove} disabled={history.length === 0 || isThinking}>
                     <Undo2 className="w-5 h-5 mr-2.5" />
                     悔棋
                  </Button>
                  <Button variant="secondary" className="h-14 rounded-xl font-black bg-zinc-900/60 border border-white/5 hover:bg-zinc-800 text-zinc-400 text-sm font-serif italic" onClick={getHint} disabled={winner !== null || isThinking}>
                     <Lightbulb className="w-5 h-5 mr-2.5 text-amber-500" />
                     提示
                  </Button>
                  <Button variant="destructive" className="h-14 rounded-xl font-black bg-red-600 hover:bg-red-500 text-white shadow-xl shadow-red-900/20 active:scale-95 transition-all col-span-2 text-xl" onClick={resetGame}>
                     <RotateCcw className="w-5 h-5 mr-2.5" />
                     新局
                  </Button>
                </div>
             </div>
          </div>
        </div>

        {/* BOTTOM: Rules Documentation */}
        <div className="max-w-7xl w-full px-4 mt-16 mb-8">
          <div className="bg-[#111111] rounded-[2rem] p-8 shadow-2xl border border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-900/10 blur-[100px] rounded-full mix-blend-screen pointer-events-none" />
            
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 flex items-center justify-center border border-white/5 shadow-inner">
                <BookOpen className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-2xl font-black italic tracking-tighter uppercase text-white">中国象棋规则 - Pikafish Online</h3>
                <p className="text-[10px] uppercase font-bold tracking-[0.3em] text-zinc-500 mt-1">皮卡鱼在线 · Rules & Piece Movements</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-4 p-5 bg-zinc-900/40 rounded-2xl border border-white/5 hover:bg-zinc-900/80 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-red-900/20 text-red-500 flex items-center justify-center font-black text-2xl shrink-0 shadow-inner border border-red-500/20">帥</div>
                  <div>
                    <h4 className="font-black text-sm text-zinc-200 mb-1">将 / 帅</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed font-medium">只能在“九宫”内活动，每次走一格，不能对面（即双方将帅不能在同一直线上且中间无子）。</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-5 bg-zinc-900/40 rounded-2xl border border-white/5 hover:bg-zinc-900/80 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center font-black text-2xl shrink-0 shadow-inner border border-white/5">仕</div>
                  <div>
                    <h4 className="font-black text-sm text-zinc-200 mb-1">士 / 仕</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed font-medium">只能在“九宫”内活动，每次沿对角线走一格，主要用于保护将帅。</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-5 bg-zinc-900/40 rounded-2xl border border-white/5 hover:bg-zinc-900/80 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-red-900/20 text-red-500 flex items-center justify-center font-black text-2xl shrink-0 shadow-inner border border-red-500/20">相</div>
                  <div>
                    <h4 className="font-black text-sm text-zinc-200 mb-1">象 / 相</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed font-medium">走“田”字（对角线两格），不能过河。若“田”字中心有棋子，则不能跃过（俗称“塞象眼”）。</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-4 p-5 bg-zinc-900/40 rounded-2xl border border-white/5 hover:bg-zinc-900/80 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center font-black text-2xl shrink-0 shadow-inner border border-white/5">馬</div>
                  <div>
                    <h4 className="font-black text-sm text-zinc-200 mb-1">马 / 傌</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed font-medium">走“日”字（直行一格加斜行一格）。若直行方向紧接的交叉点有棋子，则不能走（俗称“蹩马腿”）。</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-5 bg-zinc-900/40 rounded-2xl border border-white/5 hover:bg-zinc-900/80 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-red-900/20 text-red-500 flex items-center justify-center font-black text-2xl shrink-0 shadow-inner border border-red-500/20">俥</div>
                  <div>
                    <h4 className="font-black text-sm text-zinc-200 mb-1">车 / 俥</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed font-medium">沿横线或直线的路径移动，步数不限，只要前方没有除目标棋子外的障碍物即可。威力极强。</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-5 bg-zinc-900/40 rounded-2xl border border-white/5 hover:bg-zinc-900/80 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center font-black text-2xl shrink-0 shadow-inner border border-white/5">砲</div>
                  <div>
                    <h4 className="font-black text-sm text-zinc-200 mb-1">炮 / 砲</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed font-medium">移动方式同“车”。但吃子时，中间必须隔着且只能隔着一个棋子（己方或敌方皆可，称为“炮架”）。</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-4 p-5 bg-zinc-900/40 rounded-2xl border border-white/5 hover:bg-zinc-900/80 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-red-900/20 text-red-500 flex items-center justify-center font-black text-2xl shrink-0 shadow-inner border border-red-500/20">兵</div>
                  <div>
                    <h4 className="font-black text-sm text-zinc-200 mb-1">卒 / 兵</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed font-medium">过河前，每次只能向前走一格；过了河之后，可以向前、向左或向右走一格。无论何时都不能后退。</p>
                  </div>
                </div>
                
                <div className="p-6 bg-zinc-800/20 rounded-2xl border border-white/5 flex flex-col items-center text-center gap-3 h-full justify-center">
                  <Shield className="w-10 h-10 text-zinc-500 opacity-60 mb-2" />
                  <h4 className="text-sm font-black text-zinc-300">胜负条件</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed max-w-[200px]">
                    对局的目标是率先“将死”对方的将或帅。若一方无法合法移动任何棋子，则被判“困毙”并输掉比赛。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}