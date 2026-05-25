const flagMarkerPattern = /(?:\uD83C[\uDDE6-\uDDFF]){1,2}/g;

export function withoutFlagMarkers(value: string) {
  return value
    .replace(flagMarkerPattern, "")
    .replace(/\s+/g, " ")
    .trim();
}
