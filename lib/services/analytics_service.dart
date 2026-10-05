import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/api_config.dart';
import '../models/analytics_summary.dart';

class AnalyticsService {
  AnalyticsService({http.Client? client, Uri? baseUri})
    : _client = client ?? http.Client(),
      _ownsClient = client == null,
      _endpoint = (baseUri ?? ApiConfig.baseUri).resolve(
        '/api/analytics/summary',
      );

  final http.Client _client;
  final bool _ownsClient;
  final Uri _endpoint;

  Future<AnalyticsSummary> fetchSummary() async {
    late final http.Response response;
    try {
      response = await _client
          .get(_endpoint, headers: const {'Accept': 'application/json'})
          .timeout(const Duration(seconds: 10));
    } catch (_) {
      throw const AnalyticsException(
        'Analytics are unavailable. Check your connection and try again.',
      );
    }

    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } on FormatException {
      throw const AnalyticsException(
        'The server returned an invalid response.',
      );
    }
    if (decoded is! Map<String, dynamic> || response.statusCode != 200) {
      final message = decoded is Map<String, dynamic>
          ? decoded['message']
          : null;
      throw AnalyticsException(
        message is String ? message : 'Analytics could not be loaded.',
      );
    }
    final data = decoded['data'];
    if (decoded['success'] != true || data is! Map<String, dynamic>) {
      throw const AnalyticsException('The server returned invalid analytics.');
    }
    try {
      return AnalyticsSummary.fromJson(data);
    } on Object {
      throw const AnalyticsException('The server returned invalid analytics.');
    }
  }

  void close() {
    if (_ownsClient) _client.close();
  }
}

class AnalyticsException implements Exception {
  const AnalyticsException(this.message);

  final String message;
}
