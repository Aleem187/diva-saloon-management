"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Signature capture on a canvas, with pointer events so a finger, a stylus and
 * a mouse all behave the same.
 *
 * The drawn bitmap is written into a hidden input as a PNG data URL, which the
 * server action decodes and stores in the private signatures bucket. Nothing
 * about the signature is trusted client-side beyond being an image.
 */
export function SignaturePad({
  name,
  error,
}: {
  name: string;
  error?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // Match the backing store to the element's real size so lines are crisp on
  // high-density screens and coordinates are not skewed.
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    if (rect.width === 0) return;

    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // The ink follows the page's text colour token, so no colour is hard-coded.
    ctx.strokeStyle = getComputedStyle(canvas).color;
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  function pointAt(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = pointAt(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointAt(event);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    commit();
  }

  function commit() {
    const canvas = canvasRef.current;
    const input = inputRef.current;
    if (!canvas || !input) return;
    input.value = canvas.toDataURL("image/png");
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (inputRef.current) inputRef.current.value = "";
    setHasInk(false);
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-small font-medium text-ink">Customer signature</span>
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasInk}>
          Clear
        </Button>
      </div>

      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        aria-label="Signature pad. Sign with your finger, stylus or mouse."
        className="h-40 w-full cursor-crosshair touch-none rounded-xl border border-dashed border-field bg-surface text-ink"
      />

      <input ref={inputRef} type="hidden" name={name} />

      <p className="mt-1 text-fine text-muted">
        Sign in the box above. This is stored as part of the medical record.
      </p>

      {error ? (
        <p className="mt-1 text-fine font-medium text-critical-fg" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
