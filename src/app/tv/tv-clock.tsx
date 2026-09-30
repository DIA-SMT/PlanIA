"use client";

import { useEffect, useState } from "react";

export function TvClock() {
  const [time, setTime] = useState<string>("");
  const [date, setDate] = useState<string>("");

  useEffect(() => {
    function tick() {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
      );
      setDate(
        now.toLocaleDateString("es-AR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      );
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  if (!time) return null;

  return (
    <div className="text-right">
      <p className="text-4xl font-light text-foreground tabular-nums tracking-wider">
        {time}
      </p>
      <p className="text-sm text-muted first-letter:uppercase mt-1">{date}</p>
    </div>
  );
}
