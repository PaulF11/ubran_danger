// File note: This file handles location_search_service_test.dart.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:urban_danger/services/location_search_service.dart';

void main() {
  test('search requests a bounded, location-biased result set', () async {
    late http.Request request;
    final service = LocationSearchService(
      client: MockClient((incoming) async {
        request = incoming;
        return http.Response(
          jsonEncode({
            'features': [
              {
                'geometry': {
                  'coordinates': [121.05, 14.51],
                },
                'properties': {
                  'name': 'Taguig City Hall',
                  'street': 'Gen. Luna Street',
                  'city': 'Taguig',
                },
              },
            ],
          }),
          200,
        );
      }),
      endpoint: Uri.parse('https://photon.example.test/api/'),
    );
    addTearDown(service.close);

    final results = await service.search('Taguig City Hall');

    expect(request.url.queryParameters['q'], 'Taguig City Hall');
    expect(request.url.queryParameters['bbox'], '120.98,14.45,121.12,14.62');
    expect(request.url.queryParameters['countrycode'], 'PH');
    expect(request.url.queryParameters['limit'], '8');
    expect(results, hasLength(1));
    expect(results.single.label, 'Taguig City Hall, Gen. Luna Street, Taguig');
    expect(results.single.point.latitude, 14.51);
    expect(results.single.point.longitude, 121.05);
  });

  test('rejects results outside supported coordinates and cities', () async {
    final service = LocationSearchService(
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({
            'features': [
              {
                'geometry': {
                  'coordinates': [121.0, 14.52],
                },
                'properties': {'name': 'Other city', 'city': 'Manila'},
              },
              {
                'geometry': {
                  'coordinates': [121.5, 14.52],
                },
                'properties': {'name': 'Outside', 'city': 'Taguig'},
              },
              {
                'geometry': {
                  'coordinates': [121.05, 14.51],
                },
                'properties': {'name': 'No city attribution'},
              },
            ],
          }),
          200,
        ),
      ),
      endpoint: Uri.parse('https://photon.example.test/api/'),
    );
    addTearDown(service.close);

    expect(await service.search('Taguig'), isEmpty);
  });

  test(
    'returns no suggestions without calling provider for short queries',
    () async {
      var requested = false;
      final service = LocationSearchService(
        client: MockClient((_) async {
          requested = true;
          return http.Response('{"features":[]}', 200);
        }),
        endpoint: Uri.parse('https://photon.example.test/api/'),
      );
      addTearDown(service.close);

      expect(await service.search('  '), isEmpty);
      expect(requested, isFalse);
    },
  );
}
