import React, { useState } from 'react';
import { Upload, X, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface LogoUploadProps {
  currentLogo?: string;
  onUpload: (logo: string) => void;
  onRemove: () => void;
}

const MAX_FILE_SIZE = 512 * 1024; // 512 KB
const MAX_DIMENSION = 512;

export default function LogoUpload({ currentLogo, onUpload, onRemove }: LogoUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      processFile(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    setError(null);

    if (file.size > MAX_FILE_SIZE) {
      setError(`Image is too large (${(file.size / 1024).toFixed(0)} KB). Maximum size is 512 KB.`);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const img = new Image();
      img.onload = () => {
        if (img.width > MAX_DIMENSION || img.height > MAX_DIMENSION) {
          setError(`Image dimensions are ${img.width}×${img.height}px. Maximum is ${MAX_DIMENSION}×${MAX_DIMENSION}px.`);
          return;
        }
        onUpload(base64String);
      };
      img.onerror = () => {
        setError('Could not read this image. Please try a different file.');
      };
      img.src = base64String;
    };
    reader.onerror = () => {
      setError('Could not read this file. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-lg p-3 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {currentLogo ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative inline-block">
              <img
                src={currentLogo}
                alt="Company Logo"
                className="h-10 max-w-[180px] object-contain"
              />
              <button
                onClick={onRemove}
                className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600 transition-colors"
                title="Remove logo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="bg-secondary/70 rounded-lg p-3 border border-secondary/60">
            <p className="text-xs text-muted-foreground mb-2 font-medium">Preview in sidebar</p>
            <div className="flex items-center gap-2">
              <img
                src={currentLogo}
                alt="Logo preview"
                className="h-8 max-w-[140px] object-contain"
              />
              <span className="text-sm text-muted-foreground truncate">WolfPack Assistant</span>
            </div>
          </div>

          <div>
            <input
              type="file"
              id="logo-upload"
              accept="image/*"
              onChange={handleFileInput}
              className="hidden"
            />
            <label
              htmlFor="logo-upload"
              className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary-hover cursor-pointer transition-colors touch-manipulation"
            >
              <Upload className="h-4 w-4" />
              Replace logo
            </label>
          </div>
        </div>
      ) : (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
            isDragging ? 'border-primary bg-primary/10' : 'border-secondary',
          )}
        >
          <input
            type="file"
            id="logo-upload"
            accept="image/*"
            onChange={handleFileInput}
            className="hidden"
          />
          <label
            htmlFor="logo-upload"
            className="flex flex-col items-center gap-2 cursor-pointer"
          >
            <Upload className="h-8 w-8 text-secondary-foreground" />
            <div className="text-sm text-secondary-foreground">
              <span className="font-medium text-primary">Click to upload</span> or drag and
              drop
            </div>
            <p className="text-xs text-secondary-foreground">
              PNG or JPG, up to 512×512px and 512 KB
            </p>
          </label>
        </div>
      )}
    </div>
  );
}
