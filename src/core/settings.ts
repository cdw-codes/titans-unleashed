import { resolveQualityLevel, type QualityLevel } from '../config/quality';

/** True when the URL forces a preset (testing): automatic quality is then disabled. */
export function qualityForced(): boolean {
  return new URLSearchParams(location.search).has('quality');
}

export function loadQualityLevel(): QualityLevel {
  return resolveQualityLevel(new URLSearchParams(location.search).get('quality'));
}
