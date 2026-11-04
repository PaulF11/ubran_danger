import 'package:flutter/widgets.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

const taguigMapCenter = LatLng(14.5176, 121.0509);
const taguigMapInitialZoom = 13.2;
final taguigMapBounds = LatLngBounds(
  const LatLng(14.45, 120.98),
  const LatLng(14.62, 121.12),
);
final paterosMapBounds = LatLngBounds(
  const LatLng(14.48, 121.02),
  const LatLng(14.56, 121.09),
);

// Simplified OSM administrative boundary relation 184776 for Taguig City.
const taguigBoundary = <LatLng>[
  LatLng(14.530537, 121.0222048),
  LatLng(14.5001437, 121.0468592),
  LatLng(14.4656657, 121.0490985),
  LatLng(14.4513116, 121.122151),
  LatLng(14.5189436, 121.1222787),
  LatLng(14.5441587, 121.0958944),
  LatLng(14.5377199, 121.066386),
  LatLng(14.5604251, 121.066395),
  LatLng(14.5684046, 121.0471328),
  LatLng(14.5419183, 121.0460129),
  LatLng(14.530537, 121.0222048),
];

MapOptions taguigMapOptions({required TapCallback onTap}) => MapOptions(
  initialCenter: taguigMapCenter,
  initialZoom: taguigMapInitialZoom,
  initialCameraFit: CameraFit.bounds(
    bounds: taguigMapBounds,
    padding: const EdgeInsets.all(12),
  ),
  cameraConstraint: CameraConstraint.containCenter(bounds: taguigMapBounds),
  minZoom: 12,
  maxZoom: 19,
  keepAlive: true,
  onTap: onTap,
);

bool isInsidePolygon(LatLng point, List<LatLng> polygon) {
  var isInside = false;
  for (var index = 0, previous = polygon.length - 1;
      index < polygon.length;
      previous = index++) {
    final currentPoint = polygon[index];
    final previousPoint = polygon[previous];
    final crossesLatitude =
        (currentPoint.latitude > point.latitude) !=
        (previousPoint.latitude > point.latitude);
    if (crossesLatitude) {
      final boundaryLongitude =
          (previousPoint.longitude - currentPoint.longitude) *
                  (point.latitude - currentPoint.latitude) /
                  (previousPoint.latitude - currentPoint.latitude) +
              currentPoint.longitude;
      if (point.longitude < boundaryLongitude) {
        isInside = !isInside;
      }
    }
  }
  return isInside;
}

bool isWithinTaguigMapArea(LatLng point) {
  if (isInsidePolygon(point, taguigBoundary)) {
    return true;
  }
  return point.latitude >= paterosMapBounds.southWest.latitude &&
      point.latitude <= paterosMapBounds.northEast.latitude &&
      point.longitude >= paterosMapBounds.southWest.longitude &&
      point.longitude <= paterosMapBounds.northEast.longitude;
}
