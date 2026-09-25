import type Parser from "tree-sitter";

declare module "tree-sitter-javascript" {
  const language: Parser.Language;
  export = language;
}

declare module "tree-sitter-typescript" {
  const languages: {
    typescript: Parser.Language;
    tsx: Parser.Language;
  };
  export = languages;
}
