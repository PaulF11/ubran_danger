// File note: This file handles route_service.dart.

import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../core/api_config.dart';
import '../models/route_plan.dart';

class RouteService {
  RouteService({http.Client? client, Uri? baseUri})
    : _client = client ?? http.Client(),
      _ownsClient = client == null,
      _endpoint = (baseUri ?? ApiConfig.baseUri).resolve('/api/routes/route');

  final http.Client _client;
  final bool _ownsClient;
  final Uri _endpoint;

  Future<RoutePlan> fetchRoute({
    required LatLng start,
    required LatLng destination,
    String mode = 'car',
  }) async {
    final analysis = await fetchRoutes(
      start: start,
      destination: destination,
      mode: mode,
    );
    return analysis.routes.first;
  }

  Future<RouteAnalysis> fetchRoutes({
    required LatLng start,
    required LatLng destination,
    String mode = 'car',
  }) async {
    late final http.Response response;
    try {
      response = await _client
          .post(
            _endpoint,
            headers: const {'Content-Type': 'application/json'},
            body: jsonEncode({
              'start': {
                'latitude': start.latitude,
                'longitude': start.longitude,
              },
              'destination': {
                'latitude': destination.latitude,
                'longitude': destination.longitude,
              },
              'mode': mode,
            }),
          )
          .timeout(
            const Duration(seconds: 12),
            onTimeout: () => throw const RouteException(
              'Route analysis timed out. Please try again.',
            ),
          );
    } on RouteException {
      rethrow;
    } catch (_) {
      throw const RouteException(
        'The route service is unavailable. Check your connection and try again.',
      );
    }

    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } on FormatException {
      throw const RouteException('The server returned an invalid route.');
    }
    if (decoded is! Map<String, dynamic> || response.statusCode != 200) {
      final message = decoded is Map<String, dynamic>
          ? decoded['message']
          : null;
      throw RouteException(
        message is String ? message : 'Route not available.',
      );
    }
    final data = decoded['data'];
    if (decoded['success'] != true || data is! Map<String, dynamic>) {
      throw const RouteException('The server returned an invalid route.');
    }
    if (data['routeMode'] == null && mode != 'car') {
      throw RouteException(
        'The route provider did not confirm a $mode route. '
        'This travel mode is unavailable from the configured backend.',
      );
    }
    if (data['routeMode'] != null && data['routeMode'] != mode) {
      throw RouteException(
        'The route provider returned ${data['routeMode']} routing instead of $mode.',
      );
    }
    try {
      return RouteAnalysis.fromJson(data);
    } on Object {
      throw const RouteException('The server returned invalid route geometry.');
    }
  }

  void close() {
    if (_ownsClient) _client.close();
  }
}

class RouteException implements Exception {
  const RouteException(this.message);

  final String message;
}
