// File note: This file handles incident_service.dart.
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/api_config.dart';
import '../models/incident.dart';

class IncidentService {
  IncidentService({http.Client? client, Uri? baseUri})
    : _client = client ?? http.Client(),
      _ownsClient = client == null,
      _endpoint = (baseUri ?? ApiConfig.baseUri).resolve('/api/incidents');

  final http.Client _client;
  final bool _ownsClient;
  final Uri _endpoint;

  Future<List<Incident>> fetchIncidents({
    IncidentFeedView view = IncidentFeedView.recent,
  }) async {
    final endpoint = _endpoint.replace(
      queryParameters: {..._endpoint.queryParameters, 'view': view.value},
    );
    final response = await _client
        .get(endpoint, headers: const {'Accept': 'application/json'})
        .timeout(
          const Duration(seconds: 10),
          onTimeout: () => throw const IncidentApiException(
            'The request timed out. Please try again.',
          ),
        );

    if (response.statusCode != 200) {
      throw IncidentApiException(
        'Failed to load incidents (HTTP ${response.statusCode}).',
      );
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Invalid incidents response.');
    }
    if (decoded['success'] != true) {
      final message = decoded['message'];
      throw IncidentApiException(
        message is String ? message : 'Failed to load incidents.',
      );
    }

    final data = decoded['data'];
    if (data is! List) {
      throw const FormatException('Invalid incidents data.');
    }

    return data
        .map((item) {
          if (item is! Map<String, dynamic>) {
            throw const FormatException('Invalid incident record.');
          }
          return Incident.fromJson(item);
        })
        .toList(growable: false);
  }

  void close() {
    if (_ownsClient) {
      _client.close();
    }
  }
}

enum IncidentFeedView {
  recent('recent'),
  historical('historical'),
  all('all');

  const IncidentFeedView(this.value);

  final String value;
}

class IncidentApiException implements Exception {
  const IncidentApiException(this.message);

  final String message;

  @override
  String toString() => 'IncidentApiException: $message';
}
