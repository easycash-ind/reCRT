import { useEffect, useRef } from "react";
import { Vector2 } from "three";

/**
 * Tracks normalised mouse position across the entire window.
 * Returns a mutable ref whose `.x` and `.y` are in [-1, 1].
 * Resets to (0, 0) when the mouse leaves the window so the
 * center model smoothly returns to its default orientation.
 */
export function useMousePosition() {
  const mouse = useRef(new Vector2(0, 0));

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.current.y = -(e.clientY / window.innerHeight - 0.5) * 2;
    };
    const onLeave = () => {
      mouse.current.set(0, 0);
    };
    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return mouse;
}
