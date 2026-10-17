import { normalizeText } from '../textCleaner.js';

const TIMESTAMP = /(\d{1,2}:)?\d{1,2}:\d{2}([.,]\d{1,3})?/;
const CUE_TIMING = new RegExp(`^(${TIMESTAMP.source})\\s*-->\\s*(${TIMESTAMP.source})`);
const INLINE_STAMP = /^\[?((?:\d{1,2}:)?\d{1,2}:\d{2})(?:[.,]\d{1,3})?\]?\s*[-–]?\s*(.*)$/;

const GROUP_SECONDS = 90; // merge cues into ~90-second passages

function toSeconds(stamp) {
  const parts = stamp.replace(',', '.').split(':').map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function formatTimestamp(totalSeconds) {
  const s = Math.floor(totalSeconds);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** Parse WebVTT / SRT cues into { start, text } entries. */
function parseCues(content) {
  const cues = [];
  const blocks = content.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const timingIdx = lines.findIndex((l) => CUE_TIMING.test(l));
    if (timingIdx === -1) continue;
    const start = toSeconds(CUE_TIMING.exec(lines[timingIdx])[1]);
    const text = lines
      .slice(timingIdx + 1)
      .join(' ')
      .replace(/<v\s+([^>]+)>/g, '$1: ') // WebVTT voice spans → "Speaker: "
      .replace(/<[^>]+>/g, '');
    if (text) cues.push({ start, text });
  }
  return cues;
}

/** Parse plain-text transcripts with "[00:12:30] Speaker: text" style lines. */
function parseStampedLines(content) {
  const cues = [];
  for (const raw of content.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = INLINE_STAMP.exec(line);
    if (m && m[2]) cues.push({ start: toSeconds(m[1]), text: m[2] });
    else if (cues.length) cues[cues.length - 1].text += ` ${line}`;
  }
  return cues;
}

/** Heuristic: a .txt file is a transcript if most non-empty lines start with a timestamp. */
export function looksLikeTranscript(content) {
  const lines = content.split(/\r?\n/).filter((l) => l.trim()).slice(0, 60);
  if (lines.length < 3) return false;
  const stamped = lines.filter((l) => INLINE_STAMP.test(l.trim()) || CUE_TIMING.test(l.trim())).length;
  return stamped / lines.length >= 0.5;
}

/**
 * Groups cues into passages; each passage's section is its start timestamp so
 * citations can point to "Lecture 12 — 00:14:05".
 */
export function extractTranscript(content) {
  const cues = /-->/.test(content) ? parseCues(content) : parseStampedLines(content);
  if (!cues.length) {
    const text = normalizeText(content);
    return { segments: text ? [{ text }] : [] };
  }

  const segments = [];
  let group = null;
  for (const cue of cues) {
    if (!group || cue.start - group.start >= GROUP_SECONDS) {
      if (group) segments.push(group);
      group = { start: cue.start, parts: [] };
    }
    group.parts.push(cue.text);
  }
  if (group) segments.push(group);

  return {
    segments: segments.map((g) => ({
      text: normalizeText(g.parts.join(' ')),
      section: formatTimestamp(g.start),
    })),
  };
}
