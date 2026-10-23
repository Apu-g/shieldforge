"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";

interface TooltipProps {
  content: ReactNode;
  children?: ReactNode;
  title?: string;
  className?: string;
  position?: "top" | "bottom" | "left" | "right";
  inline?: boolean;
}

export function Tooltip({
  content,
  children,
  title,
  className = "",
  position = "top",
  inline = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setVisible(false);
    }
    if (visible) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [visible]);

  return (
    <span
      ref={containerRef}
      className={`sf-tooltip-wrapper ${inline ? "is-inline" : ""} ${className}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children ? (
        children
      ) : (
        <button
          type="button"
          className="sf-help-btn"
          aria-label={title ?? "More information"}
          tabIndex={0}
        >
          <span className="sf-help-icon">?</span>
        </button>
      )}

      {visible && (
        <span
          className={`sf-tooltip-bubble position-${position}`}
          role="tooltip"
          aria-hidden={!visible}
        >
          {title && <span className="sf-tooltip-title">{title}</span>}
          <span className="sf-tooltip-content">{content}</span>
        </span>
      )}
    </span>
  );
}

export function InfoHelp({
  content,
  title,
  position = "top",
}: {
  content: ReactNode;
  title?: string;
  position?: "top" | "bottom" | "left" | "right";
}) {
  return <Tooltip content={content} title={title} position={position} />;
}
