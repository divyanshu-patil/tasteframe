// Layout picker sections (editor + gallery). Every template id belongs to exactly one group;
// groups.test.ts keeps this complete.
import type { TemplateId } from "./types";

export const LAYOUT_GROUPS: { id: string; name: string; ids: TemplateId[] }[] = [
  {
    id: "cutouts",
    name: "Cutouts & posters",
    ids: ["cutout", "playercut", "colorbox", "tornstrip", "focus", "xerox", "yearbook", "cctv", "kissmark", "magazine", "newspaper"],
  },
  { id: "screens", name: "Screens & cameras", ids: ["playlist", "desktop", "chat", "viewfinder", "camcorder", "camtilt"] },
  {
    id: "music",
    name: "Song cover & music",
    ids: ["coverface", "coversingle", "coverfloat", "coverbubble", "coverstack", "coverpolaroid", "coversepia", "covercorner", "covermouth", "nowplaying", "vinyl"],
  },
  {
    id: "multi",
    name: "Multi-photo",
    ids: ["duo", "splitscreen", "booth", "torncollage", "grid", "mosaic", "polaroids", "triptych", "sepiabooth", "daysplit", "halfword", "stackedcards", "bwstack", "wavecut", "diagonal", "stills", "filmstrip", "photodump", "moodboard"],
  },
  {
    id: "type",
    name: "Type & notes",
    ids: ["weekday", "verticalday", "scripttitle", "refresh", "bigletters", "navheader", "quotemarks", "notesapp", "notesdark", "handnote", "sticky", "checklist", "calendarcard", "receipt", "stats", "redblock", "badge", "subtitlebar"],
  },
  { id: "film", name: "Film & mood", ids: ["cinematic", "vintage", "filmburn", "spotlight", "bluehour", "hearts", "softfocus", "minimal"] },
  {
    id: "paper",
    name: "Paper & scrapbook",
    ids: ["editorial", "journal", "scrapbook", "ticket", "y2k", "torn", "note", "doodlesun", "bigpolaroid", "framein", "postcard"],
  },
];

export const groupOf = (id: TemplateId) => LAYOUT_GROUPS.find((g) => g.ids.includes(id));
