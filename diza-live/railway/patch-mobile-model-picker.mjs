// Viewport-safe mobile ModelPicker placement for narrow Android screens.
// Only changes popup positioning; not engine selection, catalog, saved model,
// settings, keys, chat layout or desktop UI.
import { readFileSync, writeFileSync } from "node:fs";

const target = "/opt/bloks/src/components/ModelPicker.tsx";
const source = readFileSync(target,"utf8");
const oldClass = "className=\"absolute right-0 top-full z-30 mt-1.5 flex max-h-[min(34rem,calc(100dvh-4.5rem))] w-[300px] max-w-[92vw] origin-top-right animate-pop-in flex-col overflow-hidden rounded-xl border bg-popover shadow-lg shadow-(color:--shadow-color)\"";
const newClass = "className=\"absolute right-0 top-full z-30 mt-1.5 flex max-h-[min(34rem,calc(100dvh-4.5rem))] w-[300px] max-w-[92vw] origin-top-right animate-pop-in flex-col overflow-hidden rounded-xl border bg-popover shadow-lg shadow-(color:--shadow-color) max-sm:fixed max-sm:inset-x-3 max-sm:top-[clamp(4.5rem,23dvh,12rem)] max-sm:mt-0 max-sm:max-h-[calc(77dvh-1rem)] max-sm:w-auto max-sm:max-w-none max-sm:origin-top\"";
if (source.split(oldClass).length !== 2) {
  throw Error("ModelPicker viewport patch: pinned upstream anchor mismatch");
}
writeFileSync(target,source.replace(oldClass,newClass));
console.log("BLOKS_MOBILE_MODEL_PICKER_VIEWPORT_CLAMP=PASS");
