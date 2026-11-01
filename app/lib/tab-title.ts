export const awayTitleDelay = 30_000;

type TitleDocument = Pick<Document, "title" | "visibilityState" | "addEventListener" | "removeEventListener">;
type TitleClock = { setTimeout: (callback: () => void, delay: number) => number; clearTimeout: (id: number) => void };

export function manageTabTitle(title?: string, awayTitle?: string, pageDocument: TitleDocument = document, clock: TitleClock = window) {
  const originalTitle = pageDocument.title;
  const activeTitle = title ?? originalTitle;
  let lastApplied = originalTitle;
  let timer: number | undefined;
  let stopped = false;
  const apply = (value: string) => { pageDocument.title = value; lastApplied = value; };
  const cancel = () => { if (timer !== undefined) clock.clearTimeout(timer); timer = undefined; };
  const update = () => {
    cancel();
    if (pageDocument.visibilityState === "hidden" && awayTitle) {
      timer = clock.setTimeout(() => {
        timer = undefined;
        if (!stopped && pageDocument.visibilityState === "hidden") apply(awayTitle);
      }, awayTitleDelay);
    } else apply(activeTitle);
  };
  apply(activeTitle);
  update();
  pageDocument.addEventListener("visibilitychange", update);
  return () => {
    stopped = true;
    cancel();
    pageDocument.removeEventListener("visibilitychange", update);
    // Leave a newer page's metadata alone when navigation has already changed it.
    if (pageDocument.title === lastApplied) pageDocument.title = originalTitle;
  };
}
