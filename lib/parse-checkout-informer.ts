/** Разбор строки информера сценария (как на чекауте и thank-you). */
export function parseCheckoutInformer(raw: string): { title: string; body: string } {
  const text = raw.trim();
  if (!text) return { title: "", body: "" };
  if (text.includes("\n")) {
    const [title, ...rest] = text.split("\n");
    return { title: title.trim(), body: rest.join(" ").trim() };
  }
  if (text.includes("::")) {
    const [title, ...rest] = text.split("::");
    return { title: title.trim(), body: rest.join("::").trim() };
  }
  const sentenceSplit = text.match(/^(.+?[.!?])\s+(.+)$/);
  if (sentenceSplit) {
    return {
      title: sentenceSplit[1]!.replace(/[.!?]\s*$/, "").trim(),
      body: sentenceSplit[2]!.trim(),
    };
  }
  return { title: text, body: "" };
}
