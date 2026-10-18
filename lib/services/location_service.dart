import 'package:geolocator/geolocator.dart';

enum LocationAccess { granted, denied, permanentlyDenied, servicesDisabled }

abstract interface class LocationProvider {
  Future<bool> isServiceEnabled();
  Future<LocationPermission> checkPermission();
  Future<LocationPermission> requestPermission();
  Stream<Position> positionStream();
  Future<bool> openAppSettings();
  Future<bool> openLocationSettings();
}

class GeolocatorLocationProvider implements LocationProvider {
  const GeolocatorLocationProvider();

  @override
  Future<bool> isServiceEnabled() => Geolocator.isLocationServiceEnabled();

  @override
  Future<LocationPermission> checkPermission() => Geolocator.checkPermission();

  @override
  Future<LocationPermission> requestPermission() =>
      Geolocator.requestPermission();

  @override
  Stream<Position> positionStream() => Geolocator.getPositionStream(
    locationSettings: const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 25,
    ),
  );

  @override
  Future<bool> openAppSettings() => Geolocator.openAppSettings();

  @override
  Future<bool> openLocationSettings() => Geolocator.openLocationSettings();
}

class LocationService {
  LocationService({
    LocationProvider provider = const GeolocatorLocationProvider(),
  }) : _provider = provider;

  final LocationProvider _provider;

  Future<LocationAccess> requestAccess() async {
    try {
      if (!await _provider.isServiceEnabled()) {
        return LocationAccess.servicesDisabled;
      }
      var permission = await _provider.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await _provider.requestPermission();
      }
      return switch (permission) {
        LocationPermission.always ||
        LocationPermission.whileInUse => LocationAccess.granted,
        LocationPermission.deniedForever => LocationAccess.permanentlyDenied,
        LocationPermission.denied ||
        LocationPermission.unableToDetermine => LocationAccess.denied,
      };
    } on Object catch (error) {
      throw LocationServiceException(
        'Location permission could not be checked: $error',
      );
    }
  }

  Stream<Position> get positions => _provider.positionStream();

  Future<bool> openAppSettings() => _provider.openAppSettings();
  Future<bool> openLocationSettings() => _provider.openLocationSettings();
}

class LocationServiceException implements Exception {
  const LocationServiceException(this.message);

  final String message;

  @override
  String toString() => message;
}
