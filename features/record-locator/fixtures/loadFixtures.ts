import placesNearby from './places-nearby.json';
import routesWalk from './routes-walk.json';

type PlacesApiPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  businessStatus?: string;
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
};

export function getPlacesFixturePlaces(): PlacesApiPlace[] {
  return (placesNearby as { places?: PlacesApiPlace[] }).places ?? [];
}

export function getRoutesFixturePayload(): typeof routesWalk {
  return routesWalk;
}