import { createHash } from "node:crypto";

export const THEME_BOOTSTRAP_SCRIPT =
  "!function(){try{var t=localStorage.getItem('theme');if(t&&t!=='system'){document.documentElement.className=t;document.documentElement.style.colorScheme=t}}catch(e){}}()";

export const THEME_BOOTSTRAP_SHA256 = createHash("sha256")
  .update(THEME_BOOTSTRAP_SCRIPT)
  .digest("base64");
