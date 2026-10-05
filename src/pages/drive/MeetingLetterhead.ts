import { Node } from "@tiptap/react";

// Fixed organization branding, persisted as a document node so saved meeting
// exports retain the logo when reopened, edited, printed, or exported as HTML.
export const MeetingLetterhead = Node.create({
  name: "meetingLetterhead",
  group: "block",
  atom: true,
  selectable: false,
  parseHTML() {
    return [{ tag: "header[data-cvoa-letterhead]" }];
  },
  renderHTML() {
    return [
      "header",
      {
        "data-cvoa-letterhead": "",
        class: "sheet-header",
        style:
          "display:flex;align-items:center;gap:20px;border-bottom:3px solid #b69b53;padding-bottom:18px;margin-bottom:24px",
      },
      [
        "img",
        {
          src: "https://www.cvoa.one/images/cvoa-logo.png",
          alt: "CVOA",
          width: 82,
          height: 82,
          style: "object-fit:contain",
        },
      ],
      [
        "div",
        {},
        ["p", { class: "sheet-kicker" }, "Official meeting record"],
        ["h1", {}, "Combat Veterans of America"],
      ],
    ];
  },
});
