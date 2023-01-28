import Router from "koa-router";
import Logger from "../lib/log";
import power from "../lib/power";
import { PowerEvent, PowerState } from "../types";

const context = "api";
const log = Logger.get(context);
const router = new Router();

router.get("/", async (ctx, next) => {
  log.info("/");
  ctx.body = "hello world";
  await next();
});

router.post("/power/:name/:state", async (ctx, next) => {
  switch (ctx.params.name) {
    case "power":
      switch (ctx.params.state) {
        case "on":
          power.emit(PowerEvent.Power, PowerState.On, { context });
          break;
        case "off":
          power.emit(PowerEvent.Power, PowerState.Off, { context });
          break;
        default:
          break;
      }
      break;

    case "light":
      switch (ctx.params.state) {
        case "on":
          power.emit(PowerEvent.Light, PowerState.On, { context });
          break;
        case "off":
          power.emit(PowerEvent.Light, PowerState.Off, { context });
          break;
        default:
          break;
      }
      break;

    default:
      break;
  }
  ctx.body = "updated";
  await next();
});

export default router;
