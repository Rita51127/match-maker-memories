import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Moon, Sun, Trophy, Timer, MousePointerClick, RotateCcw } from "lucide-react";
import { toast } from "sonner";

const EMOJIS = ["🚀", "🌟", "🎨", "🎵", "🍕", "🌈", "⚡", "🦄"];

type Card = {
  id: number;
  emoji: string;
  flipped: boolean;
  matched: boolean;
};

type Score = { username: string; moves: number; time: number };

function shuffle(): Card[] {
  const pairs = [...EMOJIS, ...EMOJIS];
  return pairs
    .map((emoji, i) => ({ id: i, emoji, flipped: false, matched: false }))
    .sort(() => Math.random() - 0.5)
    .map((c, i) => ({ ...c, id: i }));
}

export function MemoryGame() {
  const [cards, setCards] = useState<Card[]>(shuffle);
  const [selected, setSelected] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [won, setWon] = useState(false);
  const [username, setUsername] = useState("");
  const [saved, setSaved] = useState(false);
  const [dark, setDark] = useState(false);
  const [scores, setScores] = useState<Score[]>([]);

  // Theme
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // Timer
  useEffect(() => {
    if (!running || won) return;
    const id = setInterval(() => setTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running, won]);

  // Win check
  useEffect(() => {
    if (cards.length && cards.every((c) => c.matched)) {
      setWon(true);
      setRunning(false);
    }
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

  const handleFlip = (idx: number) => {
    if (won) return;
    const card = cards[idx];
    if (card.flipped || card.matched || selected.length === 2) return;

    if (!running) setRunning(true);

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

  const restart = () => {
    setCards(shuffle());
    setSelected([]);
    setMoves(0);
    setTime(0);
    setRunning(false);
    setWon(false);
    setSaved(false);
    setUsername("");
  };

  const saveScore = async () => {
    if (!username.trim()) {
      toast.error("Please enter your name");
      return;
    }
    const { error } = await supabase
      .from("scores")
      .insert({ username: username.trim(), moves, time });
    if (error) {
      toast.error("Failed to save score");
    } else {
      toast.success("Score saved!");
      setSaved(true);
      fetchScores();
    }
  };

  return (
    <div
      className="min-h-screen px-4 py-8"
      style={{ background: "var(--gradient-bg)" }}
    >
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Memory Match
          </h1>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDark((d) => !d)}
            aria-label="Toggle theme"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <StatCard icon={<MousePointerClick className="h-4 w-4" />} label="Moves" value={moves} />
          <StatCard icon={<Timer className="h-4 w-4" />} label="Time" value={`${time}s`} />
          <Button onClick={restart} className="h-full" variant="secondary">
            <RotateCcw className="mr-2 h-4 w-4" /> Restart
          </Button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-4 gap-3 sm:gap-4">
          {cards.map((card, idx) => (
            <CardTile key={card.id} card={card} onClick={() => handleFlip(idx)} />
          ))}
        </div>

        {/* Win modal */}
        {won && (
          <div className="mt-8 rounded-2xl border bg-card p-6 text-center shadow-lg">
            <Trophy className="mx-auto mb-3 h-12 w-12 text-yellow-500" />
            <h2 className="text-2xl font-bold">You Win! 🎉</h2>
            <p className="mt-2 text-muted-foreground">
              {moves} moves · {time} seconds
            </p>
            {!saved ? (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="Your name"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={20}
                />
                <Button onClick={saveScore}>Save Score</Button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">Score saved ✓</p>
            )}
            <Button onClick={restart} variant="outline" className="mt-4 w-full">
              Play Again
            </Button>
          </div>
        )}

        {/* Leaderboard */}
        {scores.length > 0 && (
          <div className="mt-8 rounded-2xl border bg-card p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold">
              <Trophy className="h-4 w-4" /> Top Scores
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
        )}
      </div>
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
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

function CardTile({ card, onClick }: { card: Card; onClick: () => void }) {
  const showFront = card.flipped || card.matched;
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
        {/* Back */}
        <div
          className="absolute inset-0 flex items-center justify-center rounded-xl text-2xl font-bold text-white [backface-visibility:hidden]"
          style={{
            background: "var(--gradient-card)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          ?
        </div>
        {/* Front */}
        <div
          className="absolute inset-0 flex items-center justify-center rounded-xl text-4xl [backface-visibility:hidden] sm:text-5xl"
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