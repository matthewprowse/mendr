export function toGooglePlaceId(placeId: string): string {
    return placeId.startsWith('places/') ? placeId : `places/${placeId}`;
}
