import { Denops, fn, test } from "./deps/denops.ts";
import { assertEquals, path } from "./deps/std.ts";
import { LSP, lsputil } from "./deps/lsp.ts";
import { is } from "./deps/unknownutil.ts";

async function loadPlugin(denops: Denops): Promise<void> {
  const runtimepath = path.resolve(path.fromFileUrl(new URL("../..", import.meta.url)));
  await denops.cmd(`set runtimepath^=${runtimepath}`);
  await denops.call("denops#plugin#register", "denippet");
  await denops.call("denops#plugin#wait", "denippet");
}

async function input(
  denops: Denops,
  body: string | string[],
  maps: string[],
): Promise<void> {
  let cmd = `a\\<Cmd>call denippet#anonymous(<body>)\\<CR>`;
  if (is.String(body)) {
    cmd = cmd.replace("<body>", `'${body}'`);
  } else {
    body = "[" + body.map((b) => `'${b}'`).join(" ,") + "]";
    cmd = cmd.replace("<body>", `${body}`);
  }
  for (const map of maps) {
    cmd += map;
    if (!map.startsWith("\\<Cmd>")) {
      cmd += "\\<Cmd>do TextChangedI\\<CR>";
    }
  }
  await denops.cmd(`call feedkeys("${cmd}", 'x')`);
  await denops.cmd("do ModeChanged *:n");
}

function parseBuffer(
  buffer: string[],
): { buffer: string[]; cursor: LSP.Position } {
  for (let i = 0; i < buffer.length; i++) {
    const col = buffer[i].indexOf("|");
    if (col >= 0) {
      buffer[i] = buffer[i].replace("|", "");
      // Cursor moves one position to the left when exiting insert mode.
      return { buffer, cursor: { line: i, character: col > 0 ? col - 1 : 0 } };
    }
  }
  throw new Error("Not found cursor mark (`|`)");
}

type Spec = {
  name: string;
  body: string | string[];
  maps: string[];
  expectBuffer: string[];
};

const map = {
  expand: "\\<Cmd>call denippet#expand()\\<CR>",
  jumpNext: "\\<Cmd>call denippet#jump(+1)\\<CR>",
  jumpPrev: "\\<Cmd>call denippet#jump(-1)\\<CR>",
  choiceNext: "\\<Cmd>call denippet#choice(+1)\\<CR>",
  choicePrev: "\\<Cmd>call denippet#choice(-1)\\<CR>",
};

test({
  mode: "all",
  name: "E2E",
  fn: async (denops, t) => {
    await loadPlugin(denops);

    const specs: Spec[] = [
      {
        name: "$0",
        body: "console.log($0)",
        maps: [],
        expectBuffer: ["console.log(|)"],
      },
      {
        name: "jump",
        body: "$1 $2",
        maps: ["foo", map.jumpNext, "bar"],
        expectBuffer: ["foo bar|"],
      },
      {
        name: "copy",
        body: "$1 $1",
        maps: ["bar"],
        expectBuffer: ["bar| bar"],
      },
      {
        name: "default",
        body: "${1:foo}",
        maps: ["\\<Esc>"],
        expectBuffer: ["foo|"],
      },
      {
        name: "multi line",
        body: ["if ($1) {", "\t$0", "}"],
        maps: [
          "foo",
          map.jumpNext,
          "bar",
        ],
        expectBuffer: ["if (foo) {", "\tbar|", "}"],
      },
      {
        name: "nest (jump)",
        body: ["if ($1) {", "\t$0", "}"],
        maps: [
          "\\<Cmd>call denippet#anonymous(['if ($1) {', '\t$0', '}'])\\<CR>",
          "foo",
          map.jumpNext,
          "bar",
          map.jumpNext,
          "baz",
        ],
        expectBuffer: ["if (if (foo) {", "\tbar", "}) {", "\tbaz|", "}"],
      },
      {
        name: "nest (range)",
        body: ["if ($1) {", "\t$0", "}"],
        maps: [
          "\\<Cmd>call denippet#anonymous('x == null')\\<CR>",
          map.jumpNext,
          "foo",
          map.jumpPrev,
          "bar",
        ],
        expectBuffer: ["if (bar|) {", "\tfoo", "}"],
      },
      {
        name: "multibyte",
        body: "あ$1う$2お",
        maps: ["い", map.jumpNext, "え"],
        expectBuffer: ["あいうえ|お"],
      },
    ];

    for (const spec of specs) {
      await t.step({
        name: spec.name,
        fn: async () => {
          await fn.deletebufline(denops, "%", 1, "$");
          await input(denops, spec.body, spec.maps);
          const { buffer: expectBuffer, cursor: expectCursor } = parseBuffer(spec.expectBuffer);
          const actualBuffer = await fn.getline(denops, 1, "$");
          const actualCursor = await lsputil.getCursor(denops);
          assertEquals(actualBuffer, expectBuffer);
          assertEquals(actualCursor, expectCursor);
        },
      });
    }
  },
});