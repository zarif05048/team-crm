import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function fixture(saved, prefersDark = false, blocked = false) {
  const root = { dataset: {}, style: {} }, meta = {};
  const values = new Map(saved ? [["hijraa-crm-theme",saved]] : []);
  const events = new Map(), mediaEvents = new Map();
  const media = { matches: prefersDark, addEventListener(k,fn){mediaEvents.set(k,fn);},removeEventListener(k){mediaEvents.delete(k);} };
  const storage = { getItem:k => {if(blocked)throw Error("blocked");return values.get(k)??null;},setItem(k,v){if(blocked)throw Error("blocked");values.set(k,v);} };
  const window = { localStorage:storage,matchMedia:()=>media,dispatchEvent:e=>events.get(e.type)?.(e),addEventListener:(k,fn)=>events.set(k,fn),removeEventListener:k=>events.delete(k) };
  const context = vm.createContext({document:{documentElement:root,querySelector:()=>({setAttribute:(k,v)=>meta[k]=v})},localStorage:storage,matchMedia:()=>media,window,Event:class{constructor(type){this.type=type;}},exports:{}});
  const compiled = ts.transpileModule(fs.readFileSync("src/lib/theme.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInContext(compiled,context);const api=context.exports;
  vm.runInContext(api.THEME_BOOTSTRAP,context);
  return {root,meta,media,mediaEvents,events,window,api,context,values};
}

let f=fixture("dark");assert.equal(f.root.dataset.theme,"dark");assert.equal(f.root.style.colorScheme,"dark");assert.equal(f.meta.content,"#080f1e");
f=fixture("light",true);assert.equal(f.root.dataset.theme,"light");
f=fixture(undefined,true);assert.equal(f.root.dataset.theme,"dark");assert.equal(f.root.dataset.themePreference,"system");
f=fixture("invalid");assert.equal(f.root.dataset.themePreference,"system");
f.api.setThemePreference("dark");assert.equal(f.values.get("hijraa-crm-theme"),"dark");assert.equal(f.root.dataset.theme,"dark");
f=fixture("dark",true,true);assert.equal(f.root.dataset.theme,"dark");f.api.setThemePreference("light");assert.equal(f.root.dataset.theme,"light");
f=fixture();let cleanup;
f.context.require=name=>name==="react"?{useEffect(fn){cleanup=fn();}}:name==="@/lib/theme"?f.api:{};
f.context.exports={};
vm.runInContext(ts.transpileModule(fs.readFileSync("src/components/theme-controls.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,f.context);
f.context.exports.ThemeController();
f.media.matches=true;f.mediaEvents.get("change")();assert.equal(f.root.dataset.theme,"dark");
f.api.setThemePreference("light");f.mediaEvents.get("change")();assert.equal(f.root.dataset.theme,"light");
f.events.get("storage")({key:"unrelated",newValue:"dark"});assert.equal(f.root.dataset.theme,"light");
f.events.get("storage")({key:"hijraa-crm-theme",newValue:"dark"});assert.equal(f.root.dataset.theme,"dark");
f.events.get("storage")({key:null,newValue:null});assert.equal(f.root.dataset.themePreference,"system");
cleanup();assert.equal(f.mediaEvents.size,0);assert.equal(f.events.has("storage"),false);
console.log("Theme persistence, pre-paint startup, device changes, tab sync and restricted storage checks passed.");
