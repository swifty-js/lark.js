import {
  db,
  getStyles,
  renderer
} from "./chunk-YUUBQVZN.js";
import {
  populateCommonDb
} from "./chunk-4QKD6LPA.js";
import {
  MermaidParseError
} from "./chunk-4V4RNEFN.js";
import "./chunk-JRLR7HNO.js";
import "./chunk-QFD7YU6H.js";
import "./chunk-REAKNHEJ.js";
import "./chunk-EBLDBVJM.js";
import "./chunk-FTQW6YTK.js";
import "./chunk-6DETDC3X.js";
import "./chunk-TUOZJ56R.js";
import "./chunk-JBYBLRX2.js";
import "./chunk-T3Y6OOFO.js";
import "./chunk-6TWUMTD7.js";
import "./chunk-4OTWDNBH.js";
import "./chunk-AN6UFT5R.js";
import "./chunk-3WSH4BQ6.js";
import {
  createRailroadServices
} from "./chunk-JGFHWFQQ.js";
import "./chunk-TFW6BAZG.js";
import "./chunk-TT5JRENA.js";
import "./chunk-NY6GKT4S.js";
import "./chunk-NNC447R7.js";
import {
  log
} from "./chunk-JSX2MS5Z.js";
import {
  __name
} from "./chunk-NJ2IBU5J.js";
import "./chunk-NEDD5VJA.js";

// ../../../node_modules/.pnpm/mermaid@11.17.2/node_modules/mermaid/dist/chunks/mermaid.core/railroadDiagram-O6MQD6OU.mjs
var langiumParser = createRailroadServices().Railroad.parser.LangiumParser;
var transformExpression = __name((expr) => {
  switch (expr.$type) {
    case "RailroadTerminalExpr":
      return {
        type: "terminal",
        value: expr.value
      };
    case "RailroadNonTerminalExpr":
      return {
        type: "nonterminal",
        name: expr.name
      };
    case "RailroadSpecialExpr":
      return {
        type: "special",
        text: expr.text
      };
    case "RailroadSequenceExpr": {
      const elements = expr.elements.map(transformExpression);
      return elements.length === 1 ? elements[0] : { type: "sequence", elements };
    }
    case "RailroadChoiceExpr": {
      const alternatives = expr.alternatives.map(transformExpression);
      return alternatives.length === 1 ? alternatives[0] : { type: "choice", alternatives };
    }
    case "RailroadOptionalExpr":
      return {
        type: "optional",
        element: transformExpression(expr.element)
      };
    case "RailroadOneOrMoreExpr":
      return {
        type: "repetition",
        element: transformExpression(expr.element),
        min: 1,
        max: Infinity
      };
    case "RailroadZeroOrMoreExpr":
      return {
        type: "repetition",
        element: transformExpression(expr.element),
        min: 0,
        max: Infinity
      };
    default:
      throw new Error(`Unsupported railroad expression: ${expr.$type}`);
  }
}, "transformExpression");
var transformRule = __name((rule) => {
  return {
    name: rule.name,
    definition: transformExpression(rule.definition)
  };
}, "transformRule");
var populateDb = __name((ast) => {
  populateCommonDb(ast, db);
  if (ast.title) {
    db.setTitle(ast.title);
  }
  ast.rules.map((rule) => db.addRule(transformRule(rule)));
}, "populateDb");
var parser = {
  parse: __name((input) => {
    db.clear();
    log.debug("[Railroad Parser] Starting Langium parse");
    const result = langiumParser.parse(input);
    if (result.lexerErrors.length > 0 || result.parserErrors.length > 0) {
      throw new MermaidParseError(result);
    }
    const ast = result.value;
    log.debug("[Railroad Parser] Parsed rules:", ast.rules.length);
    populateDb(ast);
    log.debug("[Railroad Parser] Parse complete");
  }, "parse"),
  parser: {
    yy: db
  }
};
var diagram = {
  parser,
  db,
  renderer,
  styles: getStyles
};
var railroadDiagram_default = diagram;
export {
  railroadDiagram_default as default,
  diagram
};
//# sourceMappingURL=railroadDiagram-O6MQD6OU-FUCJVYXM.js.map
