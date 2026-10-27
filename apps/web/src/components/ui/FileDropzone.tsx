import { Upload } from 'lucide-react';
import { type ChangeEvent, type DragEvent, useRef, useState } from 'react';
import { Button } from './Button';
import { cx } from './cx';

interface FileDropzoneProps {
  accept: string;
  onFile: (file: File) => void;
  title: string;
  hint?: string;
  /** Accessible name of the hidden file input. */
  inputLabel: string;
  disabled?: boolean;
}

/** Drag-and-drop area with a "Choose file" button (FR-03). Only the first file is used. */
export function FileDropzone({
  accept,
  onFile,
  title,
  hint,
  inputLabel,
  disabled,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const take = (files: FileList | null | undefined) => {
    const file = files?.[0];
    if (file && !disabled) onFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    take(event.dataTransfer?.files);
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    take(event.target.files);
    event.target.value = ''; // allow choosing the same file again
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      data-dragging={dragging || undefined}
      className={cx(
        'flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
        dragging ? 'border-accent bg-card-subtle' : 'border-border-strong',
        disabled && 'opacity-60',
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-text">
        <Upload size={20} aria-hidden="true" />
      </span>
      <p className="font-display text-subsection font-medium text-text">{title}</p>
      {hint && <p className="max-w-md text-control text-muted">{hint}</p>}
      <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={disabled}>
        Choose file
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        aria-label={inputLabel}
        className="sr-only"
        tabIndex={-1}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}
