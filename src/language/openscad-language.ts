// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

export const keywordsList = [
  'module', 'function', 'for', 'if', 'else', 'let', 'each',
  'use', 'include',
];

export const builtinsList = [
  // Math functions
  'abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'cos', 'cross',
  'exp', 'floor', 'ln', 'log', 'lookup', 'max', 'min', 'norm', 'pow',
  'rands', 'round', 'search', 'sign', 'sin', 'sqrt', 'tan',
  // String / list functions
  'chr', 'concat', 'len', 'ord', 'str',
  // Shapes
  'circle', 'cube', 'cylinder', 'polygon', 'polyhedron', 'sphere', 'square',
  // Transforms
  'color', 'mirror', 'multmatrix', 'resize', 'rotate', 'scale', 'translate',
  // Boolean / hull
  'difference', 'hull', 'intersection', 'minkowski', 'union',
  // Extrude / project
  'linear_extrude', 'offset', 'projection', 'rotate_extrude',
  // Misc
  'assert', 'children', 'echo', 'import', 'intersection_for',
  'render', 'surface', 'text', 'version', 'version_num',
];

export const specialVarsList = [
  'true', 'false', 'undef', 'PI',
  '$children', '$fa', '$fn', '$fs', '$t', '$vpd', '$vpr', '$vpt',
];

var conf: monaco.languages.LanguageConfiguration = {

  colorizedBracketPairs: [['{', '}'], ['(', ')'], ['[', ']']],

  wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
  comments: {
    lineComment: "//",
    blockComment: ["/*", "*/"]
  },
  brackets: [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"]
  ],
  onEnterRules: [
    {
      beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
      afterText: /^\s*\*\/$/,
      action: {
        indentAction: monaco.languages.IndentAction.IndentOutdent,
        appendText: " * "
      }
    },
    {
      beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
      action: {
        indentAction: monaco.languages.IndentAction.None,
        appendText: " * "
      }
    },
    {
      beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
      action: {
        indentAction: monaco.languages.IndentAction.None,
        appendText: "* "
      }
    },
    {
      beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
      action: {
        indentAction: monaco.languages.IndentAction.None,
        removeText: 1
      }
    }
  ],
  autoClosingPairs: [
    { open: "{", close: "}" },
    { open: "[", close: "]" },
    { open: "(", close: ")" },
    { open: '"', close: '"', notIn: ["string"] },
    { open: "'", close: "'", notIn: ["string", "comment"] },
    { open: "`", close: "`", notIn: ["string", "comment"] },
    { open: "/**", close: " */", notIn: ["string"] }
  ],
  folding: {
    markers: {
      start: new RegExp("^\\s*//\\s*#?region\\b"),
      end: new RegExp("^\\s*//\\s*#?endregion\\b")
    }
  }
};

var language: monaco.languages.IMonarchLanguage = {
  defaultToken: "invalid",
  tokenPostfix: ".scad",
  keywords: keywordsList,
  builtins: builtinsList,
  specialVars: specialVarsList,
  operators: [
    "<=", ">=", "==", "!=", "=>",
    "+", "-", "*", "/", "%",
    "<<", ">>", ">>>",
    "&", "|", "^", "!", "&&", "||",
    "?", ":", "=",
  ],
  symbols: /[=><!~?:&|+\-*\/\^%]+/,
  escapes: /\\[abfnrtv\\"']/,
  digits: /\d+/,
  tokenizer: {
    root: [[/[{}]/, "delimiter.bracket"], { include: "common" }],
    common: [
      [
        /\$?[a-z_][\w$]*/,
        {
          cases: {
            "@keywords": "keyword",
            "@builtins": "type",
            "@specialVars": "variable",
            "@default": "identifier"
          }
        }
      ],
      [/[A-Z][\w\$]*/, "type.identifier"],
      { include: "@whitespace" },
      [/[()\[\]]/, "@brackets"],
      [/[<>](?!@symbols)/, "@brackets"],
      [/!(?=([^=]|$))/, "delimiter"],
      [
        /@symbols/,
        {
          cases: {
            "@operators": "delimiter",
            "@default": ""
          }
        }
      ],
      [/(@digits)[eE]([\-+]?(@digits))?/, "number.float"],
      [/(@digits)\.(@digits)([eE][\-+]?(@digits))?/, "number.float"],
      [/(@digits)n?/, "number"],
      [/[;,.]/, "delimiter"],
      [/"([^"\\]|\\.)*$/, "string.invalid"],
      [/'([^'\\]|\\.)*$/, "string.invalid"],
      [/"/, "string", "@string_double"],
    ],
    whitespace: [
      [/[ \t\r\n]+/, ""],
      [/\/\*/, "comment", "@comment"],
      [/\/\/.*$/, "comment"]
    ],
    comment: [
      [/[^\/*]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/[\/*]/, "comment"]
    ],
    string_double: [
      [/[^\\"]+/, "string"],
      [/@escapes/, "string.escape"],
      [/\\./, "string.escape.invalid"],
      [/"/, "string", "@pop"]
    ],
    bracketCounting: [
      [/\{/, "delimiter.bracket", "@bracketCounting"],
      [/\}/, "delimiter.bracket", "@pop"],
      { include: "common" }
    ]
  }
};

export default {
  conf,
  language,
}
