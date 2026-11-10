import { APPEARANCE_COOKIE, DENSITIES, THEMES } from "./domain/appearance";

/**
 * Runs synchronously in <head>, before first paint, and copies the appearance
 * cookie onto <html>. Reading the cookie here instead of with `cookies()` in
 * the root layout keeps every route's shell statically prerenderable.
 */
export const appearanceScript = `(function(){try{var m=document.cookie.match(/(?:^|; )${APPEARANCE_COOKIE}=([^;]*)/);if(!m)return;var p=decodeURIComponent(m[1]).split("."),d=document.documentElement;if(/^(${THEMES.join("|")})$/.test(p[0]))d.setAttribute("data-theme",p[0]);if(/^(${DENSITIES.join("|")})$/.test(p[1]))d.setAttribute("data-density",p[1]);if(/^(full|reduce)$/.test(p[2]))d.setAttribute("data-motion",p[2])}catch(e){}})()`;
