import {
  Framework,
  registerViewClass,
  type FrameworkConfig,
} from "@lark.js/mvc";
import gameView from "./views/game";
import "./main.css";

registerViewClass("views/game", gameView);

const config: FrameworkConfig = {
  rootId: "app",
  routeMode: "hash",
  defaultPath: "/game",
  defaultView: "views/game",
  routes: { "/game": "views/game" },
  vdom: false,
};

Framework.boot(config);
