import { type ReactNode, useEffect, useRef, useState } from "react";
import { acceleratorLabel, appMenu } from "../../shared/app-menu.ts";
import { hasCustomTitleBar } from "../../shared/title-bar.ts";

/** The hamburger: every menu as a submenu, File open first so its commands are one click away. */
function HamburgerMenu({ hasProject }: { hasProject: boolean }) {
  const [shown, setShown] = useState(false);
  const [group, setGroup] = useState("File");
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!shown) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShown(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setShown(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [shown]);

  const toggle = () => {
    setGroup("File");
    setShown(!shown);
  };
  return (
    <span className="hamburger" ref={root}>
      <button
        className="hamburger-button"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={shown}
        onClick={toggle}
      >
        ☰
      </button>
      {shown && (
        <div className="hamburger-popup" role="menu" aria-label="Main menu">
          {appMenu(hasProject).map((menu) => (
            <div key={menu.label} className="hamburger-group">
              <button
                role="menuitem"
                aria-label={menu.label}
                aria-haspopup="menu"
                aria-expanded={group === menu.label}
                onClick={() => setGroup(group === menu.label ? "" : menu.label)}
              >
                <span>{menu.label}</span>
                <span className="hamburger-key">{group === menu.label ? "▾" : "▸"}</span>
              </button>
              {group === menu.label &&
                menu.entries.map((entry, index) =>
                  entry === "separator" ? (
                    <hr key={index} role="separator" />
                  ) : (
                    <button
                      key={entry.id}
                      role="menuitem"
                      className="hamburger-item"
                      disabled={!entry.enabled}
                      onClick={() => {
                        setShown(false);
                        void window.dryland.runMenuItem(entry.id);
                      }}
                    >
                      <span>{entry.label}</span>
                      <span className="hamburger-key">
                        {entry.accelerator === undefined
                          ? ""
                          : acceleratorLabel(entry.accelerator, window.dryland.platform)}
                      </span>
                    </button>
                  ),
                )}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

/**
 * The window's one top bar: the hamburger (Windows and Linux; macOS keeps its native menu bar), the project widget
 * (`children`), a drag region, and room for the window controls the system draws over the bar's right end.
 */
export function TitleBar({ hasProject, children }: { hasProject: boolean; children: ReactNode }) {
  return (
    <header className="titlebar">
      {hasCustomTitleBar(window.dryland.platform) && <HamburgerMenu hasProject={hasProject} />}
      {children}
      <div className="titlebar-drag" />
    </header>
  );
}
