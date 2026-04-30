import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Moon,
  Sun,
  Trophy,
  Timer,
  MousePointerClick,
  RotateCcw,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";

const ALL_EMOJIS = [
  "🚀", "🌟", "🎨", "🎵", "🍕", "🌈", "⚡", "🦄",
  "🐶", "🐱", "🦁", "🐸", "🐙", "🦊", "🐢", "🐼",
  "🍎", "🍒", "🍩", "🌮", "🌻", "🍔", "🍉", "🥑",
  "⚽", "🎲", "🎸", "🎯", "🚗", "✈️", "🚲", "🛸",
];

type Difficulty = "easy" | "medium" | "hard";
const DIFFICULTY: Record<Difficulty, { size: number; pairs: number; label: string }> = {
  easy: { size: 4, pairs: 8, label: "Easy 4×4" },
  medium: { size: 6, pairs: 18, label: "Medium 6×6" },
  hard: { size: 8, pairs: 32, label: "Hard 8×8" },
};

type Card = {
  id: number;
  emoji: string;
  flipped: boolean;
  matched: boolean;
};

type Score = { username: string; moves: number; time: number };

function buildDeck(difficulty: Difficulty): Card[] {
  const { pairs } = DIFFICULTY[difficulty];
  const chosen = ALL_EMOJIS.slice(0, pairs);
  const deck = [...chosen, ...chosen];
  return deck
    .map((emoji, i) => ({ key: Math.random(), emoji, i }))
    .sort((a, b) => a.key - b.key)
    .map((c, i) => ({ id: i, emoji: c.emoji, flipped: false, matched: false }));
}

// --- Sound effects via WebAudio (no asset deps) ---
function useSounds(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const getCtx = () => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return null;
      ctxRef.current = new Ctx();
    }
    return ctxRef.current;
  };
  const tone = useCallback(
    (freq: number, duration = 0.12, type: OscillatorType = "sine", gain = 0.15) => {
      if (!enabled) return;
      const ctx = getCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    },
    [enabled]
  );
  return {
    flip: () => tone(520, 0.08, "triangle", 0.1),
    match: () => {
      tone(660, 0.12, "sine", 0.15);
      setTimeout(() => tone(880, 0.16, "sine", 0.15), 90);
    },
    win: () => {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => tone(f, 0.18, "sine", 0.18), i * 130)
      );
    },
  };
}

export function MemoryGame() {
  // setup screen state
  const [started, setStarted] = useState(false);
  const [pendingName, setPendingName] = useState("");
  const [pendingDiff, setPendingDiff] = useState<Difficulty>("easy");

  // game state
  const [username, setUsername] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [won, setWon] = useState(false);
  const [saved, setSaved] = useState(false);

  // ui
  const [dark, setDark] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [scores, setScores] = useState<Score[]>([]);

  const sounds = useSounds(soundOn);

  // Theme
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // Timer
  useEffect(() => {
    if (!running || won || paused) return;
    const id = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running, won, paused]);

  // Win check
  useEffect(() => {
    if (cards.length && cards.every((c) => c.matched)) {
      setWon(true);
      setRunning(false);
      sounds.win();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  const fetchScores = useCallback(async () => {
    const { data } = await supabase
      .from("scores")
      .select("username, moves, time")
      .order("moves", { ascending: true })
      .order("time", { ascending: true })
      .limit(5);
    if (data) setScores(data);
  }, []);

  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  const startGame = () => {
    const name = pendingName.trim();
    if (!name) {
      toast.error("Please enter your username");
      return;
    }
    setUsername(name);
    setDifficulty(pendingDiff);
    setCards(buildDeck(pendingDiff));
    setSelected([]);
    setMoves(0);
    setTime(0);
    setRunning(false);
    setPaused(false);
    setWon(false);
    setSaved(false);
    setStarted(true);
  };

  const restart = () => {
    setCards(buildDeck(difficulty));
    setSelected([]);
    setMoves(0);
    setTime(0);
    setRunning(false);
    setPaused(false);
    setWon(false);
    setSaved(false);
  };

  const backToMenu = () => {
    setStarted(false);
    setRunning(false);
    setPaused(false);
  };

  const handleFlip = (idx: number) => {
    if (won || paused) return;
    const card = cards[idx];
    if (card.flipped || card.matched || selected.length === 2) return;

    if (!running) setRunning(true);
    sounds.flip();

    const next = cards.map((c, i) => (i === idx ? { ...c, flipped: true } : c));
    setCards(next);
    const newSel = [...selected, idx];
    setSelected(newSel);

    if (newSel.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = newSel;
      if (next[a].emoji === next[b].emoji) {
        setTimeout(() => {
          setCards((cs) =>
            cs.map((c, i) => (i === a || i === b ? { ...c, matched: true } : c))
          );
          setSelected([]);
          sounds.match();
        }, 400);
      } else {
        setTimeout(() => {
          setCards((cs) =>
            cs.map((c, i) => (i === a || i === b ? { ...c, flipped: false } : c))
          );
          setSelected([]);
        }, 1000);
      }
    }
  };

  const saveScore = async () => {
    const { error } = await supabase
      .from("scores")
      .insert({ username, moves, time });
    if (error) {
      toast.error("Failed to save score");
    } else {
      toast.success("Score saved!");
      setSaved(true);
      fetchScores();
    }
  };

  const gridSize = DIFFICULTY[difficulty].size;

  return (
    <div
      className="min-h-screen px-4 py-8"
      style={{ background: "var(--gradient-bg)" }}
    >
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Memory Match
          </h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSoundOn((s) => !s)}
              aria-label="Toggle sound"
            >
              {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setDark((d) => !d)}
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {!started ? (
          <SetupScreen
            name={pendingName}
            setName={setPendingName}
            difficulty={pendingDiff}
            setDifficulty={setPendingDiff}
            onStart={startGame}
            scores={scores}
          />
        ) : (
          <>
            {/* Stats */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                icon={<MousePointerClick className="h-4 w-4" />}
                label="Player"
                value={username}
              />
              <StatCard
                icon={<MousePointerClick className="h-4 w-4" />}
                label="Moves"
                value={moves}
              />
              <StatCard
                icon={<Timer className="h-4 w-4" />}
                label="Time"
                value={`${time}s`}
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => setPaused((p) => !p)}
                  variant="secondary"
                  className="flex-1"
                  disabled={won || !running}
                >
                  {paused ? (
                    <><Play className="mr-1 h-4 w-4" /> Resume</>
                  ) : (
                    <><Pause className="mr-1 h-4 w-4" /> Pause</>
                  )}
                </Button>
                <Button onClick={restart} variant="outline" size="icon" aria-label="Restart">
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>{DIFFICULTY[difficulty].label}</span>
              <button onClick={backToMenu} className="underline hover:text-foreground">
                ← Change difficulty
              </button>
            </div>

            {/* Grid */}
            <div
              className="relative grid gap-2 sm:gap-3"
              style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}
            >
              {cards.map((card, idx) => (
                <CardTile
                  key={card.id}
                  card={card}
                  size={gridSize}
                  onClick={() => handleFlip(idx)}
                />
              ))}
              {paused && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/80 backdrop-blur-sm">
                  <div className="text-center">
                    <Pause className="mx-auto mb-2 h-10 w-10" />
                    <p className="text-xl font-semibold">Paused</p>
                    <Button onClick={() => setPaused(false)} className="mt-3">
                      <Play className="mr-2 h-4 w-4" /> Resume
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Win modal */}
            {won && (
              <div className="mt-8 rounded-2xl border bg-card p-6 text-center shadow-lg">
                <Trophy className="mx-auto mb-3 h-12 w-12 text-yellow-500" />
                <h2 className="text-2xl font-bold">You Win, {username}! 🎉</h2>
                <p className="mt-2 text-muted-foreground">
                  {moves} moves · {time} seconds
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                  {!saved ? (
                    <Button onClick={saveScore}>Save Score</Button>
                  ) : (
                    <span className="self-center text-sm text-muted-foreground">
                      Score saved ✓
                    </span>
                  )}
                  <Button onClick={restart} variant="outline">
                    Play Again
                  </Button>
                  <Button onClick={backToMenu} variant="ghost">
                    Main Menu
                  </Button>
                </div>
              </div>
            )}

            {/* Leaderboard */}
            <Leaderboard scores={scores} />
          </>
        )}
      </div>
    </div>
  );
}

function SetupScreen({
  name,
  setName,
  difficulty,
  setDifficulty,
  onStart,
  scores,
}: {
  name: string;
  setName: (s: string) => void;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  onStart: () => void;
  scores: Score[];
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">New Game</h2>
        <label className="mb-2 block text-sm font-medium">Username</label>
        <Input
          placeholder="Enter your name"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onStart()}
        />

        <label className="mt-5 mb-2 block text-sm font-medium">Difficulty</label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${
                difficulty === d
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {DIFFICULTY[d].label}
            </button>
          ))}
        </div>

        <Button onClick={onStart} className="mt-6 w-full" size="lg">
          Start Game
        </Button>
      </div>

      <Leaderboard scores={scores} />
    </div>
  );
}

function Leaderboard({ scores }: { scores: Score[] }) {
  if (!scores.length) return null;
  return (
    <div className="mt-8 rounded-2xl border bg-card p-5">
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        <Trophy className="h-4 w-4" /> Top 5 Scores
      </h3>
      <ol className="space-y-2">
        {scores.map((s, i) => (
          <li
            key={i}
            className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm"
          >
            <span className="font-medium">
              #{i + 1} {s.username}
            </span>
            <span className="text-muted-foreground">
              {s.moves} moves · {s.time}s
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 truncate text-lg font-bold">{value}</div>
    </div>
  );
}

function CardTile({
  card,
  size,
  onClick,
}: {
  card: Card;
  size: number;
  onClick: () => void;
}) {
  const showFront = card.flipped || card.matched;
  const fontSize =
    size === 4 ? "text-3xl sm:text-5xl" : size === 6 ? "text-2xl sm:text-3xl" : "text-lg sm:text-2xl";
  return (
    <button
      onClick={onClick}
      className="group relative aspect-square w-full [perspective:1000px]"
      aria-label={showFront ? card.emoji : "Hidden card"}
    >
      <div
        className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]"
        style={{
          transform: showFront ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center rounded-xl text-xl font-bold text-white [backface-visibility:hidden]"
          style={{
            background: "var(--gradient-card)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          ?
        </div>
        <div
          className={`absolute inset-0 flex items-center justify-center rounded-xl [backface-visibility:hidden] ${fontSize}`}
          style={{
            transform: "rotateY(180deg)",
            background: card.matched ? "var(--card-matched)" : "var(--card-front)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          {card.emoji}
        </div>
      </div>
    </button>
  );
}