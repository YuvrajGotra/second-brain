import { useRef, useState } from 'react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { UploadCloud, X } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { FileIcon } from './FileIcon';
import { documentService } from '../services/knowledgeService';
import { getErrorMessage } from '../services/api';
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_MB } from '../utils/constants';
import { formatBytes } from '../utils/format';

const MAX_FILES = 10;
const extOf = (name) => (name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
const typeOf = (name) =>
  ({ '.pdf': 'pdf', '.md': 'markdown', '.markdown': 'markdown', '.vtt': 'transcript', '.srt': 'transcript' })[extOf(name)] ??
  'text';

function validateFile(file) {
  if (!ACCEPTED_EXTENSIONS.includes(extOf(file.name))) return 'Unsupported type';
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `Larger than ${MAX_UPLOAD_MB} MB`;
  if (file.size === 0) return 'File is empty';
  return null;
}

export function UploadDialog({ open, onClose, onUploaded }) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null);

  const addFiles = (list) => {
    const incoming = Array.from(list).map((file) => ({ file, error: validateFile(file), key: `${file.name}-${file.size}-${file.lastModified}` }));
    setFiles((prev) => {
      const keys = new Set(prev.map((f) => f.key));
      return [...prev, ...incoming.filter((f) => !keys.has(f.key))].slice(0, MAX_FILES);
    });
  };

  const close = () => {
    if (progress !== null) return; // don't close mid-upload
    setFiles([]);
    onClose();
  };

  const valid = files.filter((f) => !f.error);

  const upload = async () => {
    setProgress(0);
    try {
      const { documents, errors } = await documentService.upload(
        valid.map((f) => f.file),
        setProgress,
      );
      toast.success(`${documents.length} file${documents.length === 1 ? '' : 's'} uploaded`, {
        description: 'Extracting text and generating embeddings in the background…',
      });
      errors?.forEach((e) => toast.error(e.message));
      onUploaded?.(documents);
      setFiles([]);
      setProgress(null);
      onClose();
    } catch (err) {
      setProgress(null);
      toast.error(getErrorMessage(err, 'Upload failed'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Upload documents"
      description="PDF, TXT, Markdown and transcripts (VTT/SRT). Up to 10 files at once."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={progress !== null}>
            Cancel
          </Button>
          <Button onClick={upload} disabled={!valid.length} loading={progress !== null}>
            {progress !== null ? `Uploading ${progress}%` : `Upload ${valid.length || ''}`.trim()}
          </Button>
        </>
      }
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={clsx(
          'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
          dragging
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
            : 'border-zinc-300 hover:border-brand-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/50',
        )}
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
          <UploadCloud className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium">
          Drop files here or <span className="text-brand-600 dark:text-brand-400">browse</span>
        </p>
        <p className="mt-1 text-xs text-zinc-500">Max {MAX_UPLOAD_MB} MB per file</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map(({ file, error, key }) => (
            <li key={key} className="flex items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <FileIcon type={typeOf(file.name)} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className={clsx('text-xs', error ? 'text-red-600 dark:text-red-400' : 'text-zinc-500')}>
                  {error ?? formatBytes(file.size)}
                </p>
              </div>
              {progress === null && (
                <button
                  onClick={() => setFiles((prev) => prev.filter((f) => f.key !== key))}
                  className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {progress !== null && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
    </Modal>
  );
}
