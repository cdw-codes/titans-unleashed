import { resolveQualityLevel, type QualityLevel } from '../config/quality';

const QUALITY_KEY = 'kaiju.quality';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode); setting just won't persist
  }
}

export function loadQualityLevel(): QualityLevel {
  return resolveQualityLevel(new URLSearchParams(location.search).get('quality'), read(QUALITY_KEY));
}

export function saveQualityLevel(level: QualityLevel): void {
  write(QUALITY_KEY, level);
}
