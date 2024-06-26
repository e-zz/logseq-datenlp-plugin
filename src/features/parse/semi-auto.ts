import * as parse from "~/features/parse/index";
import {
  getDateForPage,
  getScheduledDateDay,
  getDeadlineDateDay,
} from "logseq-dateutils";
import { ParsedResult } from "chrono-node";
import { PluginSettings } from "~/settings/types";



const insert_at_second_line = (content: string, str: string): string => {
  const lines = content.split("\n");
  lines.splice(1, 0, str);
  return lines.join("\n");
}

export const semiAutoParse = (
  content: string,
  chronoBlock: ParsedResult[],
  parsedText: string,
  parsedStart: Date,
  parsedEnd: Date | undefined,
): string => {
  const { dateChar, scheduledChar, deadlineChar } =
    logseq.settings! as Partial<PluginSettings>;
  if (!dateChar || !scheduledChar || !deadlineChar) throw new Error();

  // handle special characters in code
  const backticksRx = /`(.*?)`/g;
  if (backticksRx.exec(content)) return "";
  

  switch (true) {
    case content.includes("@from"): {
      content = content.replace("@from", "").replace(parsedText, "");
      content = `${content}
      start-time:: ${parsedStart.toTimeString().substring(0, 5)}
      end-time:: ${parsedEnd?.toTimeString().substring(0, 5)}`;
      return content;
    }
    case content.includes(dateChar): {
      const checkTime = parse.checkIfChronoObjHasTime(chronoBlock[0]!.start);
      content = content.replace(
        `${dateChar}${parsedText}`,
        `${getDateForPage(
          parsedStart,
          logseq.settings!.preferredDateFormat,
        )}${checkTime}`,
      );
      return content;
    }
    case content.includes(scheduledChar) || content.includes(deadlineChar): {
      if (scheduledChar === "NA" || deadlineChar === "NA") {
        return content;
      }
      const scheduledOrDeadline = content.includes(scheduledChar)
        ? "SCHEDULED"
        : "DEADLINE";
        
      if (logseq.settings?.removeTime)
        parsedStart = new Date(parsedStart.setHours(0, 0, 0, 0));

      if (scheduledOrDeadline === "SCHEDULED") {
        content = content.replace(/SCHEDULED:\s<.*\n?/, "");
        content = content.replace(`${scheduledChar}${parsedText}`, "");  // must be before the next line
        content = insert_at_second_line(content, getScheduledDateDay(parsedStart));
      } else {
        content = content.replace(/DEADLINE:\s<.*\n?/, "");
        content = content.replace(`${deadlineChar}${parsedText}`, "");
        content = insert_at_second_line(content, getDeadlineDateDay(parsedStart));
      }
      return content;
    }
    default: {
      return "";
    }
  }
};

const callback = async (mutationsList: MutationRecord[]): Promise<void> => {
  for (const m of mutationsList) {
    if (
      m.type === "childList" &&
      m.removedNodes.length > 0 &&
      (m.removedNodes[0]! as HTMLElement).className ===
      "editor-inner block-editor"
    ) {
      const uuid = (m.target as HTMLElement)
        .closest('div[id^="ls-block"]')
        ?.getAttribute("blockid") as string;
      const currBlock = await logseq.Editor.getBlock(uuid);
      if (!currBlock) return;

      // Execute inline parsing
      const content = await parse.inlineParsing(currBlock);
      if (content) await logseq.Editor.updateBlock(uuid, content);
    }
  }
};

export const parseMutationObserver = (): void => {
  //@ts-expect-error
  const observer = new top!.MutationObserver(callback);
  observer.observe(top?.document.getElementById("app-container"), {
    attributes: false,
    childList: true,
    subtree: true,
  });
};
