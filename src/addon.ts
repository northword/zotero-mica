import { config } from "../package.json";
import hooks from "./hooks";
import { MicaManager } from "./modules/mica";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    env: "development" | "production";
    prefs?: { window: Window };
    locale?: {
      current: any;
    };
  };

  public hooks = hooks;
  public mica = new MicaManager();

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      prefs: undefined,
      locale: undefined,
    };
  }
}

export default Addon;
