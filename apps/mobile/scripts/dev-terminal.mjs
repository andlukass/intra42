import { stdin, stdout } from "node:process";
import { createInterface, emitKeypressEvents } from "node:readline";
import { stripVTControlCharacters } from "node:util";

// Same service-log navigation as Delphi, with a combined view for both services.
export function createDevTerminal(menu, names, interrupt) {
  const interactive = Boolean(stdin.isTTY && stdout.isTTY);
  const logs = new Map(["All", ...names].map((name) => [name, []]));
  const shortcuts = "0 all logs · 1 Metro · 2 Backend · q addresses · Ctrl+C stop";
  const wasRaw = stdin.isRaw;
  let selected = "All";
  let redraw;
  let closed = false;

  function render() {
    if (closed) return;
    if (!selected) {
      stdout.write(`\x1b[2J\x1b[H${menu}\n${shortcuts}\n`);
      return;
    }
    const rows = Math.max(1, (stdout.rows || 24) - 3);
    const columns = Math.max(1, (stdout.columns || 80) - 1);
    const wrap = new RegExp(`.{1,${columns}}`, "gu");
    const lines = logs
      .get(selected)
      .slice(-rows)
      .flatMap((line) => line.match(wrap) ?? [""]);
    stdout.write(
      `\x1b[2J\x1b[H${selected} logs · ${shortcuts}\n\n${lines.slice(-rows).join("\n") || "Waiting for logs…"}`,
    );
  }

  function onKey(_text, key) {
    if (key.ctrl && key.name === "c") return interrupt();
    if (key.name === "q") selected = undefined;
    else if (key.name === "0") selected = "All";
    else if (names[Number(key.name) - 1]) selected = names[Number(key.name) - 1];
    else return;
    render();
  }

  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(redraw);
    if (!interactive) return;
    stdin.off("keypress", onKey);
    stdout.off("resize", render);
    stdin.setRawMode(wasRaw ?? false);
    stdin.pause();
    stdout.write("\x1b[?1049l");
  }

  if (interactive) {
    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.on("keypress", onKey);
    stdin.resume();
    stdout.on("resize", render);
    process.once("exit", close);
    stdout.write("\x1b[?1049h");
    render();
  } else stdout.write(`${menu}\n`);

  return {
    watch(name, child) {
      for (const stream of [child.stdout, child.stderr]) {
        createInterface({ input: stream, terminal: false }).on("line", (line) => {
          const text = stripVTControlCharacters(line);
          for (const [view, message] of [
            [name, text],
            ["All", `[${name}] ${text}`],
          ]) {
            const lines = logs.get(view);
            lines.push(message);
            if (lines.length > 500) lines.shift();
          }
          if (!interactive) stdout.write(`[${name}] ${text}\n`);
          else if ((selected === name || selected === "All") && !closed && !redraw) {
            redraw = setTimeout(() => {
              redraw = undefined;
              render();
            }, 80);
          }
        });
      }
    },
    recent(name) {
      return logs.get(name).slice(-20).join("\n");
    },
    close,
  };
}
