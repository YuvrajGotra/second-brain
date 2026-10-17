export const ACCEPTED_EXTENSIONS = ['.pdf', '.txt', '.md', '.markdown', '.vtt', '.srt'];
export const MAX_UPLOAD_MB = 20;

export const FILE_TYPE_LABELS = {
  pdf: 'PDF',
  text: 'Text',
  markdown: 'Markdown',
  transcript: 'Transcript',
  note: 'Note',
};

export const STATUS_META = {
  uploading: { label: 'Uploading', tone: 'blue' },
  queued: { label: 'Queued', tone: 'zinc' },
  processing: { label: 'Processing', tone: 'amber' },
  indexed: { label: 'Indexed', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  disabled: { label: 'Not indexed', tone: 'zinc' },
};
