/* Targeted source adapters for Lua 5.1 / love.js. No game or mod assets included. */
(function (root) {
  "use strict";

  function fail(path, message) {
    throw new Error("Adaptação web interrompida em " + path + ": " + message);
  }

  function count(source, expression) {
    return (source.match(expression) || []).length;
  }

  function adaptLexerExtensions(path, source, report) {
    // LuaJIT accepts break; and UTF-8 identifiers, while plain Lua 5.1 does not.
    // Skip quoted/long strings and comments so displayed text is never edited.
    const edits = [];
    let cursor = 0, breaks = 0, names = 0;
    function longEnd(start) {
      const open = source.slice(start).match(/^\[(=*)\[/);
      if (!open) return null;
      const close = "]" + open[1] + "]";
      const end = source.indexOf(close, start + open[0].length);
      return end < 0 ? source.length : end + close.length;
    }
    while (cursor < source.length) {
      const ch = source[cursor];
      if (source.startsWith("--", cursor)) {
        const finish = longEnd(cursor + 2);
        const newline = source.indexOf("\n", cursor + 2);
        cursor = finish === null ? (newline < 0 ? source.length : newline + 1) : finish;
      } else if (ch === '"' || ch === "'") {
        const quote = ch;
        cursor++;
        while (cursor < source.length) {
          if (source[cursor] === "\\") cursor += 2;
          else if (source[cursor++] === quote) break;
        }
      } else if (ch === "[" && longEnd(cursor) !== null) {
        cursor = longEnd(cursor);
      } else {
        const word = source.slice(cursor).match(/^[A-Za-z_][A-Za-z_0-9]*/);
        if (!word) { cursor++; continue; }
        if (word[0] === "break") {
          const tail = source.slice(cursor + word[0].length).match(/^[ \t]*;/);
          if (tail) {
            const position = cursor + word[0].length + tail[0].length - 1;
            edits.push([position, position + 1, ""]);
            breaks++;
          }
        } else if (word[0] === "local") {
          const declaration = source.slice(cursor).match(/^local[ \t]+(👀)(?=[ \t]*=[ \t]*SMODS\.Joker\s*\{)/u);
          if (declaration) {
            const position = cursor + declaration[0].length - declaration[1].length;
            edits.push([position, position + declaration[1].length, "web_omega_eyes"]);
            names++;
          }
        }
        cursor += word[0].length;
      }
    }
    for (let i = edits.length - 1; i >= 0; i--) {
      const [start, end, text] = edits[i];
      source = source.slice(0, start) + text + source.slice(end);
    }
    if (breaks) report.push({ path, adapter: "lua51-break-terminators", count: breaks });
    if (names) report.push({ path, adapter: "omegatro-identifier", count: names });
    return source;
  }

  function adaptSteamoddedLoops(path, source, report) {
    if (!source.includes("function SMODS.calculate_card_areas") || !source.includes("goto skip")) return source;
    const guard = /if SMODS\.check_looping_context\(([_a-zA-Z.]+)\) then\s*goto skip\s*end/g;
    if (count(source, guard) !== 4 || count(source, /::skip::/g) !== 4 ||
        count(source, /goto continue/g) !== 1 || count(source, /::continue::/g) !== 1) {
      fail(path, "versão de calculate_card_areas desconhecida; não é seguro remover seus saltos");
    }
    source = source.replace(guard, "if not SMODS.check_looping_context($1) then");
    source = source.replace(/::skip::/g, "end -- web: end of non-looping card guard");
    const branch = /goto continue\s*end(?=\s*if not args or not args\.has_area then context\.cardarea = area end)/;
    if (!branch.test(source)) fail(path, "ramificação de área de cartas diferente da esperada");
    source = source.replace(branch, "else -- web: ordinary card-area path");
    source = source.replace("::continue::", "end -- web: end of special/ordinary card-area paths");
    report.push({ path, adapter: "steamodded-card-area-loops", count: 5 });
    return source;
  }

  function adaptDeckLoop(path, source, report) {
    if (!source.includes("goto continue") || !source.includes("pairs(self.P_CARDS)")) return source;
    const loop = /(for k, v in pairs\(self\.P_CARDS\) do)([\s\S]*?)::continue::/;
    const match = source.match(loop);
    if (!match || count(match[2], /goto continue/g) !== 2 || /\bgoto\s+(?!continue\b)/.test(match[2])) {
      fail(path, "versão de criação do baralho desconhecida");
    }
    // A function return has the same effect as this loop's forward continue,
    // including when it appears inside the nested rank/suit exclusion loop.
    source = source.replace(loop, (_, head, body) => head +
      "\n                local function web_add_card_prototype()" +
      body.replace(/goto continue/g, "return") +
      "\n                end\n                web_add_card_prototype()");
    report.push({ path, adapter: "steamodded-initial-deck-continue", count: 2 });
    return source;
  }

  function adaptCardRemoval(path, source, report) {
    if (!source.includes("goto skip_game_actions_during_remove")) return source;
    const guard = /if G\.in_delete_run then goto skip_game_actions_during_remove end/;
    if (count(source, /goto skip_game_actions_during_remove/g) !== 1 ||
        count(source, /::skip_game_actions_during_remove::/g) !== 1 || !guard.test(source)) {
      fail(path, "versão de Card:remove desconhecida");
    }
    source = source.replace(guard, "if not G.in_delete_run then -- web: only run game actions outside deletion");
    source = source.replace("::skip_game_actions_during_remove::", "end -- web: end of game actions");
    report.push({ path, adapter: "steamodded-card-remove", count: 1 });
    return source;
  }

  function adaptOmegaNum(path, source, report) {
    if (!source.includes("struct TalismanOmega") || !source.includes("ffi.metatype(TalismanOmega")) return source;
    const header = /local ffi = require\(["']ffi["']\)\s*local R = require\(["']big-num\.constants["']\)\s*ffi\.cdef\[\[\s*struct TalismanOmega\s*\{\s*double asize;\s*double number;\s*int8_t sign;\s*bool _nan;\s*bool _inf;\s*\};\s*\]\]\s*local TalismanOmega = ffi\.typeof\(["']struct TalismanOmega["']\)\s*local TalismanOmega_sizeof = assert\(ffi\.sizeof\(["']struct TalismanOmega["']\)\)/;
    if (!header.test(source) || count(source, /ffi\.copy\(n, self, TalismanOmega_sizeof\)/g) !== 1) {
      fail(path, "estrutura OmegaNum desconhecida; não é seguro substituir a implementação FFI");
    }
    source = source.replace(header, 'local R = require("big-num.constants")\n' +
      'local function TalismanOmega()\n' +
      '  return setmetatable({asize=0, number=0, sign=0, _nan=false, _inf=false}, OmegaMeta)\nend');
    source = source.replace("ffi.copy(n, self, TalismanOmega_sizeof)",
      "n.asize, n.number, n.sign, n._nan, n._inf = self.asize, self.number, self.sign, self._nan, self._inf");
    source = source.replace(/ffi\.metatype\(TalismanOmega, OmegaMeta\)/,
      "-- web: instances receive OmegaMeta when constructed");
    // Mixed Big/number comparisons must also be adapted by the caller's Lua AST
    // pass. Lua 5.1 tables do not inherit LuaJIT cdata comparison rules.
    report.push({ path, adapter: "amulet-omeganum-tables", count: 3, needsComparisonAdapter: true });
    return source;
  }

  function adaptAmuletMounts(path, source, report) {
    if (!source.includes("PHYSFS_mount") || !source.includes("_mod_dir_amulet")) return source;
    const mounts = /local ffi = require\(["']ffi["']\)\s*ffi\.cdef\[\[int PHYSFS_mount\(const char\* dir, const char\* mountPoint, int appendToPath\)\]\]\s*local tinymount = [^\r\n]+\s*local talisman_path = _mod_dir_amulet\s*assert\(tinymount\(talisman_path \..*?\r?\nassert\(tinymount\(talisman_path \.[^\r\n]+/;
    if (!mounts.test(source)) fail(path, "montagem de diretórios do Amulet desconhecida");
    source = source.replace(mounts,
      "-- web: talisman/ and big-num/ are copied into the game archive by the builder");
    report.push({ path, adapter: "amulet-archive-directories", count: 1 });
    return source;
  }

  function transform(path, source, report) {
    if (typeof source !== "string") throw new TypeError("Lua source must be a string");
    report = report || [];
    source = adaptSteamoddedLoops(path, source, report);
    source = adaptDeckLoop(path, source, report);
    source = adaptCardRemoval(path, source, report);
    source = adaptOmegaNum(path, source, report);
    source = adaptAmuletMounts(path, source, report);
    if (path.endsWith('items/jokers.lua') && source.includes('local disco = SMODS.Joker{') && source.includes('Get-PSDrive C') && !source.includes('web: native disk access unavailable')) {
      source = source.replace('local disco = SMODS.Joker{', 'local disco = SMODS.Joker{\n    in_pool = function() return false end, -- web: native disk access unavailable');
      report.push({path, adapter:'omegatro-native-disk-joker-excluded', count:1});
    }
    source = adaptLexerExtensions(path, source, report);
    return source;
  }

  const api = { transform };
  root.WebLuaCompat = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
