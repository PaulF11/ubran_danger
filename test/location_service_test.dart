import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:urban_danger/services/location_service.dart';

void main() {
  test('requests permission only after a denied permission check', () async {
    final provider = FakeLocationProvider(
      permission: LocationPermission.denied,
    );
    final service = LocationService(provider: provider);

    expect(await service.requestAccess(), LocationAccess.granted);
    expect(provider.permissionRequests, 1);
  });

  test('returns denied and permanently denied permission states', () async {
    final denied = LocationService(
      provider: FakeLocationProvider(
        permission: LocationPermission.denied,
        requestedPermission: LocationPermission.denied,
      ),
    );
    expect(await denied.requestAccess(), LocationAccess.denied);

    final permanentlyDenied = LocationService(
      provider: FakeLocationProvider(
        permission: LocationPermission.deniedForever,
      ),
    );
    expect(
      await permanentlyDenied.requestAccess(),
      LocationAccess.permanentlyDenied,
    );

    final deniedAfterPrompt = LocationService(
      provider: FakeLocationProvider(
        permission: LocationPermission.denied,
        requestedPermission: LocationPermission.denied,
      ),
    );
    expect(await deniedAfterPrompt.requestAccess(), LocationAccess.denied);
  });

  test('does not request permission while GPS services are disabled', () async {
    final provider = FakeLocationProvider(servicesEnabled: false);
    final service = LocationService(provider: provider);

    expect(await service.requestAccess(), LocationAccess.servicesDisabled);
    expect(provider.permissionRequests, 0);
  });

  test('surfaces permission and GPS platform failures', () async {
    final service = LocationService(
      provider: FakeLocationProvider(permissionError: StateError('GPS error')),
    );

    await expectLater(
      service.requestAccess(),
      throwsA(
        isA<LocationServiceException>().having(
          (error) => error.message,
          'message',
          contains('GPS error'),
        ),
      ),
    );
  });
}

class FakeLocationProvider implements LocationProvider {
  FakeLocationProvider({
    this.servicesEnabled = true,
    this.permission = LocationPermission.whileInUse,
    this.requestedPermission = LocationPermission.whileInUse,
    this.permissionError,
  });

  final bool servicesEnabled;
  final LocationPermission permission;
  final LocationPermission requestedPermission;
  final Object? permissionError;
  int permissionRequests = 0;

  @override
  Future<LocationPermission> checkPermission() async {
    if (permissionError case final error?) throw error;
    return permission;
  }

  @override
  Future<bool> isServiceEnabled() async => servicesEnabled;

  @override
  Future<bool> openAppSettings() async => true;

  @override
  Future<bool> openLocationSettings() async => true;

  @override
  Stream<Position> positionStream() => const Stream.empty();

  @override
  Future<LocationPermission> requestPermission() async {
    permissionRequests += 1;
    return requestedPermission;
  }
}
