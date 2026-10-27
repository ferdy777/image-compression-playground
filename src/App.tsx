import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  compressImage,
  getImageDimensions,
  shouldProcessImage,
} from "./utils/imageCompression";
import type { ImageDimensions, ProcessedImage } from "./utils/imageCompression";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDimensions(dimensions: ImageDimensions | null): string {
  return dimensions ? `${dimensions.width} × ${dimensions.height} px` : "—";
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const isProcessingRef = useRef(false);
  const [original, setOriginal] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessedImage | null>(null);
  const [originalDimensions, setOriginalDimensions] = useState<ImageDimensions | null>(null);
  const [resultDimensions, setResultDimensions] = useState<ImageDimensions | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [useWebWorker, setUseWebWorker] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
    };
  }, [originalUrl]);

  const resultUrl = result?.previewUrl ?? null;
  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  async function handleFile(file: File | undefined) {
    if (!file || isProcessingRef.current) return;

    setError(null);
    setResult(null);
    setOriginalDimensions(null);
    setResultDimensions(null);
    setProgress(0);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setOriginal(null);
      setOriginalUrl(null);
      setError("Please choose a PNG, JPEG, or WebP image.");
      return;
    }

    isProcessingRef.current = true;
    setOriginal(file);
    setOriginalUrl(URL.createObjectURL(file));
    setIsProcessing(true);

    try {
      const dimensions = await getImageDimensions(file);
      setOriginalDimensions(dimensions);

      if (!shouldProcessImage(file, dimensions)) {
        setResult({
          file,
          previewUrl: URL.createObjectURL(file),
          processingTimeMs: 0,
          skipped: true,
          usedWebWorker: false,
          uiBlockedMs: null,
        });
        setResultDimensions(dimensions);
        return;
      }

      const processed = await compressImage(file, dimensions, {
        useWebWorker,
        onProgress: setProgress,
      });
      const processedDimensions = await getImageDimensions(processed.file);
      setResult(processed);
      setResultDimensions(processedDimensions);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Something went wrong while processing this image.",
      );
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  }

  function downloadResult() {
    if (!result) return;
    const url = URL.createObjectURL(result.file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.file.name || "processed-image";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const savedBytes = original && result ? original.size - result.file.size : 0;
  const savedPercent =
    original && result && original.size > 0
      ? Math.round((savedBytes / original.size) * 100)
      : 0;

  const hasResult = original !== null && result !== null && !isProcessing;
  const uiBlockedLabel =
    result?.uiBlockedMs == null ? "UI freeze n/a" : `UI frozen ${result.uiBlockedMs} ms`;
  const processingModeLabel = result?.skipped
    ? "Already within demo limits"
    : `${result?.usedWebWorker ? "Web Worker on" : "Main thread"} · ${uiBlockedLabel}`;

  return (
    <main className="page-shell">
      <header className="page-header">
        <div className="eyebrow">FRONTEND PERFORMANCE EXPERIMENT</div>
        <h1>Browser image compression</h1>
        <p className="intro">
          Test PNG, JPEG, and WebP images before they are uploaded to Azure Blob Storage.
          Everything runs locally in your browser; this demo does not upload your image.
        </p>
      </header>

      <section
        className={`drop-zone ${isDragging ? "drop-zone--active" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div className="upload-icon" aria-hidden="true">↑</div>
        <h2>Choose an image to test</h2>
        <p>PNG, JPEG, or WebP · Drag and drop also works</p>
        <button
          className="primary-button"
          onClick={() => inputRef.current?.click()}
          disabled={isProcessing}
        >
          {isProcessing ? "Processing image…" : "Select image"}
        </button>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleInputChange}
        />
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={useWebWorker}
            onChange={(event) => setUseWebWorker(event.target.checked)}
            disabled={isProcessing}
          />
          Use Web Worker
        </label>
        <div className="limits-note">
          Demo settings: 500 KB target · 1920 px maximum dimension · Web Worker{" "}
          {useWebWorker ? "enabled" : "disabled"}
        </div>
      </section>

      {error && <div className="error-message" role="alert">{error}</div>}

      {original && (
        <section className="results-section" aria-busy={isProcessing}>
          <div className="section-heading">
            <div>
              <div className="eyebrow">RESULTS</div>
              <h2>
                {isProcessing
                  ? "Processing…"
                  : result?.skipped
                    ? "Compression skipped"
                    : result
                      ? "Processing complete"
                      : "No result"}
              </h2>
            </div>
            <button
              className="secondary-button"
              onClick={() => inputRef.current?.click()}
              disabled={isProcessing}
            >
              Try another image
            </button>
          </div>

          <div className="status-slot" role="status">
            {isProcessing && (
              <div className="processing-message">
                <span className="spinner" />
                <div className="progress-wrap">
                  <span>
                    Processing in the browser · {Math.round(progress)}%
                  </span>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </div>
            )}
            {hasResult && result.skipped && (
              <div className="info-message">
                This image is already at or below 500 KB and its dimensions are within 1920 px,
                so the demo skipped compression.
              </div>
            )}
          </div>

          <div className="summary-grid">
            <article className="summary-card">
              <span className="summary-label">Original size</span>
              <strong>{formatBytes(original.size)}</strong>
              <span className="summary-detail">{formatDimensions(originalDimensions)}</span>
            </article>
            <article className="summary-card">
              <span className="summary-label">Result size</span>
              <strong>{hasResult ? formatBytes(result.file.size) : "—"}</strong>
              <span className="summary-detail">
                {hasResult ? formatDimensions(resultDimensions) : "—"}
              </span>
            </article>
            <article className="summary-card">
              <span className="summary-label">Size change</span>
              <strong
                className={
                  hasResult
                    ? savedBytes >= 0
                      ? "positive-value"
                      : "negative-value"
                    : undefined
                }
              >
                {hasResult
                  ? savedBytes >= 0
                    ? `${savedPercent}% smaller`
                    : `${Math.abs(savedPercent)}% larger`
                  : "—"}
              </strong>
              <span className="summary-detail">
                {hasResult
                  ? savedBytes >= 0
                    ? `${formatBytes(savedBytes)} saved`
                    : `${formatBytes(Math.abs(savedBytes))} added`
                  : "—"}
              </span>
            </article>
            <article className="summary-card">
              <span className="summary-label">Processing time</span>
              <strong>
                {hasResult
                  ? result.skipped
                    ? "0 ms"
                    : `${(result.processingTimeMs / 1000).toFixed(2)} s`
                  : "—"}
              </strong>
              <span className="summary-detail">
                {hasResult ? processingModeLabel : "—"}
              </span>
            </article>
          </div>

          <div className="preview-grid">
            <ImagePreview title="Original" file={original} url={originalUrl} />
            <ImagePreview
              title={result?.skipped ? "Selected image (unchanged)" : "Processed image"}
              file={hasResult ? result.file : null}
              url={hasResult ? result.previewUrl : null}
              pending={isProcessing}
            />
          </div>

          <div className="result-actions">
            <button className="primary-button" onClick={downloadResult} disabled={!hasResult}>
              Download processed image
            </button>
            <p>
              Compare quality visually before deciding whether these settings are suitable
              for production.
            </p>
          </div>
        </section>
      )}

      <footer className="footer-note">
        <strong>Testing note:</strong> The 500 KB and 1920 px limits are examples, not final
        requirements. Web Workers help keep the UI responsive, but compression still uses CPU
        and memory.
      </footer>
    </main>
  );
}

interface ImagePreviewProps {
  title: string;
  file: File | null;
  url: string | null;
  pending?: boolean;
}

function ImagePreview({ title, file, url, pending = false }: ImagePreviewProps) {
  return (
    <article className="preview-card">
      <div className="preview-heading">
        <h3>{title}</h3>
        <span>{file ? formatBytes(file.size) : "—"}</span>
      </div>
      <div className="image-stage">
        {url ? (
          <img src={url} alt={`${title} preview`} />
        ) : (
          <span>{pending ? "Processing…" : "No preview available"}</span>
        )}
      </div>
      <div className="file-name" title={file?.name}>
        {file?.name ?? "—"}
      </div>
    </article>
  );
}
