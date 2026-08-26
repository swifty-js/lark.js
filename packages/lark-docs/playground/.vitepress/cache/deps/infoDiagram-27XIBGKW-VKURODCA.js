import {
  parse
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
import "./chunk-JGFHWFQQ.js";
import "./chunk-TFW6BAZG.js";
import "./chunk-TT5JRENA.js";
import {
  selectSvgElement
} from "./chunk-NY6GKT4S.js";
import {
  configureSvgSize
} from "./chunk-NNC447R7.js";
import {
  log
} from "./chunk-JSX2MS5Z.js";
import {
  __name
} from "./chunk-NJ2IBU5J.js";
import "./chunk-NEDD5VJA.js";

// ../../../node_modules/.pnpm/mermaid@11.17.2/node_modules/mermaid/dist/chunks/mermaid.core/infoDiagram-27XIBGKW.mjs
var parser = {
  parse: __name(async (input) => {
    const ast = await parse("info", input);
    log.debug(ast);
  }, "parse")
};
var DEFAULT_INFO_DB = {
  version: "11.17.2" + (true ? "" : "-tiny")
};
var getVersion = __name(() => DEFAULT_INFO_DB.version, "getVersion");
var db = {
  getVersion
};
var draw = __name((text, id, version) => {
  log.debug("rendering info diagram\n" + text);
  const svg = selectSvgElement(id);
  configureSvgSize(svg, 100, 400, true);
  const group = svg.append("g");
  group.append("text").attr("x", 100).attr("y", 40).attr("class", "version").attr("font-size", 32).style("text-anchor", "middle").text(`v${version}`);
}, "draw");
var renderer = { draw };
var diagram = {
  parser,
  db,
  renderer
};
export {
  diagram
};
//# sourceMappingURL=infoDiagram-27XIBGKW-VKURODCA.js.map
