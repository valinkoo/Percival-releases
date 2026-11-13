import { describe, expect, it } from 'vitest';
import { fileKindLabel, formatFileSize } from './format';

describe('formatFileSize', () => {
  it('shows small sizes in octets', () => {
    expect(formatFileSize(0)).toBe('0 o');
    expect(formatFileSize(812)).toBe('812 o');
    expect(formatFileSize(1023)).toBe('1023 o');
  });

  it('switches to Ko, Mo and Go with a decimal comma', () => {
    expect(formatFileSize(1024)).toBe('1 Ko');
    expect(formatFileSize(1536)).toBe('1,5 Ko');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 Mo');
    expect(formatFileSize(25 * 1024 * 1024)).toBe('25 Mo');
    expect(formatFileSize(1.25 * 1024 * 1024 * 1024)).toBe('1,3 Go');
  });
});

describe('fileKindLabel', () => {
  it('names the main kinds of file', () => {
    expect(fileKindLabel('application/pdf')).toBe('PDF');
    expect(fileKindLabel('image/png')).toBe('Image');
    expect(fileKindLabel('audio/mpeg')).toBe('Audio');
    expect(fileKindLabel('video/mp4')).toBe('Vidéo');
    expect(fileKindLabel('application/zip')).toBe('Archive');
    expect(fileKindLabel('text/csv')).toBe('Texte');
    expect(fileKindLabel('application/json')).toBe('Texte');
  });

  it('falls back on "Document" for office formats and anything else', () => {
    expect(
      fileKindLabel('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).toBe('Document');
    expect(fileKindLabel('application/octet-stream')).toBe('Document');
  });
});
