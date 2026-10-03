"use client";

/**
 * Dev-only visual feedback capture. Right-click any wrapped section to leave
 * a comment; a screenshot of that exact element is attached automatically.
 * Entries land in `.claude/dev-feedback.json` for an AI assistant (or a
 * human) to act on later — see `.claude/skills/iterate/SKILL.md`.
 *
 * Ported from the equivalent SwiftUI pattern in the Direktor project
 * (`DevFeedbackManager` / `.devFeedback()`), adapted for the DOM: instead of
 * screen-capturing a whole window and drawing a highlight box around the
 * clicked view, we rasterize the wrapped element directly, so the capture
 * *is* the highlight.
 *
 * Renders children with zero wrapper and zero JS in production builds —
 * this whole module is only ever reached behind the `isDev` check below.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const isDev = process.env.NODE_ENV !== "production";

type MenuState = { x: number; y: number } | null;
type ComposerState = { x: number; y: number } | null;
type SaveState = "idle" | "capturing" | "saving" | "saved" | "error";

function DevFeedbackInner({ name, children }: { name: string; children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [composer, setComposer] = useState<ComposerState>(null);
  const [comment, setComment] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const closeAll = useCallback(() => {
    setMenu(null);
    setComposer(null);
    setComment("");
    setSaveState("idle");
  }, []);

  const onContextMenu = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: Math.min(e.clientX, window.innerWidth - 190),
      y: Math.min(e.clientY, window.innerHeight - 70),
    });
  }, []);

  useEffect(() => {
    if (!menu && !composer) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuElRef.current?.contains(target)) return;
      if (composerElRef.current?.contains(target)) return;
      closeAll();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, composer]);

  useEffect(() => {
    if (composer) textareaRef.current?.focus();
  }, [composer]);

  const menuElRef = useRef<HTMLDivElement>(null);
  const composerElRef = useRef<HTMLDivElement>(null);

  const openComposer = useCallback(() => {
    if (!menu) return;
    setComposer(menu);
    setMenu(null);
  }, [menu]);

  const submit = useCallback(async () => {
    const trimmed = comment.trim();
    if (!trimmed || !wrapperRef.current) return;

    setSaveState("capturing");
    let screenshot: string | undefined;
    try {
      const { toPng } = await import("html-to-image");
      // wrapperRef itself is `display: contents` (so it never affects layout)
      // and therefore has no box of its own — capture its actual rendered
      // child instead, or html-to-image would measure a 0x0 element.
      const { children } = wrapperRef.current;
      const target =
        children.length === 1 ? (children[0] as HTMLElement) : wrapperRef.current;
      screenshot = await toPng(target, {
        pixelRatio: 1.5,
        cacheBust: true,
        backgroundColor: "#ffffff",
      });
    } catch (err) {
      console.warn("[dev-feedback] screenshot capture failed, saving without one", err);
    }

    setSaveState("saving");
    try {
      const res = await fetch("/api/dev-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, comment: trimmed, screenshot }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setSaveState("saved");
      setTimeout(closeAll, 900);
    } catch (err) {
      console.error("[dev-feedback] failed to save", err);
      setSaveState("error");
    }
  }, [comment, name, closeAll]);

  return (
    <div ref={wrapperRef} onContextMenu={onContextMenu} style={{ display: "contents" }}>
      {children}
      {menu &&
        createPortal(
          <div
            ref={menuElRef}
            className="fixed z-[9999] min-w-[180px] rounded-md border border-neutral-200 bg-white py-1 text-sm shadow-lg"
            style={{ top: menu.y, left: menu.x }}
          >
            <button
              type="button"
              onClick={openComposer}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-neutral-800 hover:bg-neutral-100"
            >
              📝 Dev Feedback…
            </button>
            <div className="border-t border-neutral-100 px-3 py-1 text-xs text-neutral-400">
              {name}
            </div>
          </div>,
          document.body,
        )}
      {composer &&
        createPortal(
          <div
            ref={composerElRef}
            className="fixed z-[9999] w-80 rounded-lg border border-neutral-200 bg-white p-3 shadow-xl"
            style={{
              top: Math.min(composer.y, window.innerHeight - 220),
              left: Math.min(composer.x, window.innerWidth - 336),
            }}
          >
            <div className="mb-2 text-xs font-medium text-neutral-500">
              Dev Feedback — <span className="text-neutral-700">{name}</span>
            </div>
            <textarea
              ref={textareaRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="What needs to change?"
              rows={4}
              className="w-full resize-none rounded border border-neutral-300 p-2 text-sm text-neutral-900 outline-none focus:border-neutral-500"
              disabled={saveState === "capturing" || saveState === "saving"}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-neutral-400">
                {saveState === "capturing" && "Capturing screenshot…"}
                {saveState === "saving" && "Saving…"}
                {saveState === "saved" && "✅ Saved"}
                {saveState === "error" && "⚠️ Failed to save"}
                {saveState === "idle" && "⌘⏎ to save"}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeAll}
                  className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!comment.trim() || saveState === "capturing" || saveState === "saving"}
                  className="rounded bg-neutral-900 px-2 py-1 text-xs text-white hover:bg-neutral-700 disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Wrap any section/component so it can be right-clicked for feedback.
 * `name` should mirror the component hierarchy (e.g. "Home.OutbreakCard")
 * so an AI assistant can map a feedback entry straight to a file.
 *
 * No-op (renders children only, no wrapper element) outside development.
 */
export function DevFeedback({ name, children }: { name: string; children: ReactNode }) {
  if (!isDev) return <>{children}</>;
  return <DevFeedbackInner name={name}>{children}</DevFeedbackInner>;
}
