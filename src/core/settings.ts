import { resolveQualityLevel, type QualityLevel } from '../config/quality';

export function loadQualityLevel(): QualityLevel {
  return resolveQualityLevel(new URLSearchParams(location.search).get('quality'));
}
