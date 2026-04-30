import { createFileRoute } from "@tanstack/react-router";
import { MemoryGame } from "@/components/MemoryGame";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <>
      <MemoryGame />
      <Toaster />
    </>
  );
}
