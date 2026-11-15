// File note: This file handles incident_service_test.dart.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:urban_danger/services/incident_service.dart';

void main() {
  test('incident service requests the selected feed view', () async {
    final requests = <Uri>[];
    final service = IncidentService(
      client: MockClient((request) async {
        requests.add(request.url);
        return http.Response(jsonEncode({'success': true, 'data': []}), 200);
      }),
      baseUri: Uri.parse('https://production.example'),
    );
    addTearDown(service.close);

    await service.fetchIncidents();
    await service.fetchIncidents(view: IncidentFeedView.historical);
    await service.fetchIncidents(view: IncidentFeedView.all);

    expect(
      requests.map((uri) => uri.queryParameters['view']),
      ['recent', 'historical', 'all'],
    );
  });

  test('incident service preserves all valid records from the production payload',
      () async {
    final payload = [
      {
        'id': 7,
        'category_name': 'Robbery',
        'category_description': 'Taking property through force or intimidation.',
        'city': 'Taguig City',
        'barangay': 'Central Signal Village',
        'latitude': '14.51168170',
        'longitude': '121.05593720',
        'location_description': 'General Espino Street, Barangay Central Signal',
        'location_source_name': 'OpenStreetMap Nominatim',
        'location_source_url': 'https://www.openstreetmap.org/node/4237680099',
        'description': 'Police reported that two men allegedly robbed a barbershop.',
        'severity': 'HIGH',
        'incident_date': '2026-11-01T20:44:00+08:00',
        'incident_time_known': 1,
        'source': 'Daily Tribune',
        'source_name': 'Daily Tribune',
        'source_url': 'https://tribune.net.ph/2026/11/03/2-men-nabbed-after-armed-barbershop-heist-in-taguig',
        'source_published_at': '2026-11-03',
        'verification_status': 'VERIFIED',
        'verification_method': 'Manual review',
        'last_verified_at': '2026-11-05T04:10:44Z',
      },
      {
        'id': 12,
        'category_name': 'Law Enforcement',
        'category_description': 'Law-enforcement operation or fugitive apprehension.',
        'city': 'Taguig City',
        'barangay': 'Western Bicutan',
        'latitude': '14.50952730',
        'longitude': '121.03802440',
        'location_description': 'Barangay Western Bicutan',
        'location_source_name': 'OpenStreetMap Nominatim',
        'location_source_url': 'https://www.openstreetmap.org/relation/6306287',
        'description': 'The Bureau of Immigration reported an arrest.',
        'severity': 'MEDIUM',
        'incident_date': '2026-10-13',
        'incident_time_known': 0,
        'source': 'Bureau of Immigration',
        'source_name': 'Bureau of Immigration',
        'source_url': 'https://immigration.gov.ph/bi-nabs-south-korean-fugitive-wanted-over-illegal-gambling-activities/',
        'source_published_at': '2026-10-25',
        'verification_status': 'VERIFIED',
        'verification_method': 'Manual review',
        'last_verified_at': '2026-11-05T05:21:54Z',
      },
      {
        'id': 8,
        'category_name': 'Shooting',
        'category_description': 'Firearm discharge or armed encounter reported by a trusted source.',
        'city': 'Taguig City',
        'barangay': 'Western Bicutan',
        'latitude': '14.50952730',
        'longitude': '121.03802440',
        'location_description': 'Purok 1, PNR Site, Barangay Western Bicutan',
        'location_source_name': 'OpenStreetMap Nominatim',
        'location_source_url': 'https://www.openstreetmap.org/relation/6306287',
        'description': 'GMA News reported a police armed encounter.',
        'severity': 'HIGH',
        'incident_date': '2026-10-22',
        'incident_time_known': 0,
        'source': 'GMA News',
        'source_name': 'GMA News',
        'source_url': 'https://www.gmanetwork.com/news/balitambayan/balita/1006850/2-lalaking-sakay-sa-motorsiklo-na-umiwas-sa-oplan-sita-patay-nang-makipagbarilan-umano-sa-mga-pu/story',
        'source_published_at': '2026-10-22',
        'verification_status': 'VERIFIED',
        'verification_method': 'Manual review',
        'last_verified_at': '2026-11-05T04:10:45Z',
      },
      {
        'id': 20,
        'category_name': 'Drug-related',
        'category_description': 'Drug-related arrest or police operation reported by a trusted source.',
        'city': 'Taguig City',
        'barangay': 'Western Bicutan',
        'latitude': '14.50952730',
        'longitude': '121.03802440',
        'location_description': 'Juliano Avenue near Gate 3 Plaza, Barangay Western Bicutan',
        'location_source_name': 'OpenStreetMap Nominatim',
        'location_source_url': 'https://www.openstreetmap.org/relation/6306287',
        'description': 'Daily Tribune reported a buy-bust operation.',
        'severity': 'HIGH',
        'incident_date': '2026-10-19T20:30:00+08:00',
        'incident_time_known': 1,
        'source': 'Daily Tribune',
        'source_name': 'Daily Tribune',
        'source_url': 'https://tribune.net.ph/2026/10/20/p442-k-shabu-seized-in-taguig-buy-bust',
        'source_published_at': '2026-10-20',
        'verification_status': 'VERIFIED',
        'verification_method': 'Manual review',
        'last_verified_at': '2026-11-05T05:22:06Z',
      },
      {
        'id': 9,
        'category_name': 'Drug-related',
        'category_description': 'Drug-related arrest or police operation reported by a trusted source.',
        'city': 'Taguig City',
        'barangay': 'Maharlika Village',
        'latitude': '14.49735560',
        'longitude': '121.05554160',
        'location_description': 'Barangay Maharlika Village',
        'location_source_name': 'OpenStreetMap Nominatim',
        'location_source_url': 'https://www.openstreetmap.org/relation/10988111',
        'description': 'Daily Tribune reported a buy-bust operation in Barangay Maharlika Village.',
        'severity': 'LOW',
        'incident_date': '2026-10-14T17:20:00+08:00',
        'incident_time_known': 1,
        'source': 'Daily Tribune',
        'source_name': 'Daily Tribune',
        'source_url': 'https://tribune.net.ph/2026/10/15/high-value-target-collared-2',
        'source_published_at': '2026-10-16',
        'verification_status': 'VERIFIED',
        'verification_method': 'Manual review',
        'last_verified_at': '2026-11-05T04:10:46Z',
      },
    ];

    final service = IncidentService(
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({'success': true, 'data': payload}),
          200,
        ),
      ),
      baseUri: Uri.parse('https://production.example'),
    );
    addTearDown(service.close);

    final incidents = await service.fetchIncidents();

    expect(incidents, hasLength(5));
    expect(incidents.map((incident) => incident.id), [7, 12, 8, 20, 9]);
  });
}
