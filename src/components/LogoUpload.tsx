import React, { useState } from 'react';
import { Upload, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface LogoUploadProps {
  currentLogo?: string;
  onUpload: (logo: string) => void;
  onRemove: () => void;
}

export default function LogoUpload({ currentLogo, onUpload, onRemove }: LogoUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

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
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      onUpload(base64String);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      {currentLogo ? (
        <div className="relative inline-block">
          <img
            src={currentLogo}
            alt="Company Logo"
            className="h-10 max-w-[180px] object-contain"
          />
          <button
            onClick={onRemove}
            className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
            isDragging ? "border-primary bg-primary/10" : "border-secondary",
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
              Recommended: 180×40px PNG with transparency
            </p>
          </label>
        </div>
      )}
    </div>
  );
}