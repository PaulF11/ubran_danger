// File note: This file handles location_search_service.dart.
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../core/taguig_region.dart';

class LocationSuggestion {
  const LocationSuggestion({required this.point, required this.label});

  final LatLng point;
  final String label;
}

class LocationSearchService {
  LocationSearchService({http.Client? client, Uri? endpoint})
    : _client = client ?? http.Client(),
      _ownsClient = client == null,
      _endpoint = endpoint ?? Uri.parse('https://photon.komoot.io/api/');

  final http.Client _client;
  final bool _ownsClient;
  final Uri _endpoint;

  Future<List<LocationSuggestion>> search(String query) async {
    final trimmedQuery = query.trim();
    if (trimmedQuery.length < 3) return const [];

    final uri = _endpoint.replace(
      queryParameters: {
        ..._endpoint.queryParameters,
        'q': trimmedQuery,
        'lat': taguigMapCenter.latitude.toString(),
        'lon': taguigMapCenter.longitude.toString(),
        'zoom': '13',
        'limit': '8',
        'bbox': '120.98,14.45,121.12,14.62',
        'countrycode': 'PH',
        'lang': 'en',
      },
    );
    final response = await _client
        .get(uri, headers: const {'Accept': 'application/json'})
        .timeout(const Duration(seconds: 8));
    if (response.statusCode != 200) {
      throw LocationSearchException(
        'Place search is unavailable (HTTP ${response.statusCode}).',
      );
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic> || decoded['features'] is! List) {
      throw const FormatException('Invalid place-search response.');
    }

    final suggestions = <LocationSuggestion>[];
    for (final feature in decoded['features'] as List) {
      if (feature is! Map<String, dynamic>) continue;
      final geometry = feature['geometry'];
      final properties = feature['properties'];
      if (geometry is! Map<String, dynamic> ||
          geometry['coordinates'] is! List ||
          properties is! Map<String, dynamic>) {
        continue;
      }

      final coordinates = geometry['coordinates'] as List;
      if (coordinates.length < 2 ||
          coordinates[0] is! num ||
          coordinates[1] is! num) {
        continue;
      }
      final longitude = (coordinates[0] as num).toDouble();
      final latitude = (coordinates[1] as num).toDouble();
      final point = LatLng(latitude, longitude);
      if (!latitude.isFinite ||
          !longitude.isFinite ||
          !isWithinTaguigMapArea(point) ||
          !_isSupportedCity(properties)) {
        continue;
      }

      final label = _formatLabel(properties);
      if (label.isNotEmpty) {
        suggestions.add(LocationSuggestion(point: point, label: label));
      }
    }
    return suggestions;
  }

  bool _isSupportedCity(Map<String, dynamic> properties) {
    final city = properties['city']?.toString().trim().toLowerCase();
    return city == 'taguig' || city == 'taguig city' || city == 'pateros';
  }

  String _formatLabel(Map<String, dynamic> properties) {
    final name = properties['name']?.toString().trim();
    final street = properties['street']?.toString().trim();
    final district = properties['district']?.toString().trim();
    final city = properties['city']?.toString().trim();
    final parts = <String>[
      if (name != null && name.isNotEmpty) name,
      if (street != null && street.isNotEmpty && street != name) street,
      if (district != null && district.isNotEmpty) district,
      if (city != null && city.isNotEmpty) city,
    ];
    return parts.toSet().join(', ');
  }

  void close() {
    if (_ownsClient) _client.close();
  }
}

class LocationSearchException implements Exception {
  const LocationSearchException(this.message);

  final String message;
}
