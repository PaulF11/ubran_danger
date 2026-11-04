import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:urban_danger/services/admin_auth_service.dart';

void main() {
  test(
    'login sends credentials and securely stores an ADMIN session',
    () async {
      final storage = _MemorySessionStore();
      final client = MockClient((request) async {
        expect(request.method, 'POST');
        expect(request.url.path, '/api/auth/login');
        expect(request.headers['content-type'], 'application/json');
        expect(jsonDecode(request.body), {
          'email': 'admin@urbandanger.local',
          'password': 'sample-password',
        });
        return http.Response(
          jsonEncode({
            'success': true,
            'data': {
              'token': 'test.jwt.token',
              'expiresInSeconds': 1800,
              'user': {
                'id': 'admin-id',
                'email': 'admin@urbandanger.local',
                'role': 'ADMIN',
              },
            },
          }),
          200,
        );
      });
      final service = AdminAuthService(
        client: client,
        storage: storage,
        baseUri: Uri.parse('http://localhost:3000'),
      );

      final session = await service.login(
        email: ' admin@urbandanger.local ',
        password: 'sample-password',
      );

      expect(session.role, 'ADMIN');
      expect(session.email, 'admin@urbandanger.local');
      expect(storage.values['admin.jwt'], 'test.jwt.token');
      expect(storage.values['admin.role'], 'ADMIN');
      expect(await service.restoreSession(), isNotNull);
    },
  );

  test('login rejects non-admin roles without persisting a token', () async {
    final storage = _MemorySessionStore();
    final service = AdminAuthService(
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({
            'success': true,
            'data': {
              'token': 'test.jwt.token',
              'expiresInSeconds': 1800,
              'user': {
                'id': 'user-id',
                'email': 'user@example.test',
                'role': 'USER',
              },
            },
          }),
          200,
        ),
      ),
      storage: storage,
      baseUri: Uri.parse('http://localhost:3000'),
    );

    await expectLater(
      service.login(email: 'user@example.test', password: 'password'),
      throwsA(
        isA<AdminAuthException>().having(
          (error) => error.message,
          'message',
          'This account does not have administrator access.',
        ),
      ),
    );
    expect(storage.values, isEmpty);
  });

  test(
    'protected dashboard uses the saved bearer token and clears on 401',
    () async {
      final storage = _MemorySessionStore();
      var authorization = '';
      final service = AdminAuthService(
        client: MockClient((request) async {
          if (request.method == 'POST') {
            return http.Response(
              jsonEncode({
                'success': true,
                'data': {
                  'token': 'test.jwt.token',
                  'expiresInSeconds': 1800,
                  'user': {
                    'id': 'admin-id',
                    'email': 'admin@example.test',
                    'role': 'ADMIN',
                  },
                },
              }),
              200,
            );
          }
          authorization = request.headers['authorization'] ?? '';
          return http.Response(
            jsonEncode({
              'success': true,
              'data': {
                'totalVerifiedIncidents': 12,
                'incidentsAddedRecently': 3,
                'statisticsLabel': 'Application statistics.',
              },
            }),
            200,
          );
        }),
        storage: storage,
        baseUri: Uri.parse('http://localhost:3000'),
      );
      await service.login(email: 'admin@example.test', password: 'password');

      final summary = await service.fetchDashboard();

      expect(authorization, 'Bearer test.jwt.token');
      expect(summary.totalVerifiedIncidents, 12);
      expect(summary.incidentsAddedRecently, 3);

      final unauthorizedService = AdminAuthService(
        client: MockClient((request) async {
          if (request.method == 'POST') {
            return http.Response(
              jsonEncode({
                'success': true,
                'data': {
                  'token': 'test.jwt.token',
                  'expiresInSeconds': 1800,
                  'user': {
                    'id': 'admin-id',
                    'email': 'admin@example.test',
                    'role': 'ADMIN',
                  },
                },
              }),
              200,
            );
          }
          return http.Response(
            jsonEncode({'success': false, 'message': 'Unauthorized'}),
            401,
          );
        }),
        storage: storage,
        baseUri: Uri.parse('http://localhost:3000'),
      );
      await unauthorizedService.login(
        email: 'admin@example.test',
        password: 'password',
      );
      await expectLater(
        unauthorizedService.fetchDashboard(),
        throwsA(
          isA<AdminAuthException>().having(
            (error) => error.sessionInvalid,
            'sessionInvalid',
            isTrue,
          ),
        ),
      );
      expect(storage.values, isEmpty);
    },
  );
}

class _MemorySessionStore implements AdminSessionStore {
  final Map<String, String> values = {};

  @override
  Future<void> delete(String key) async {
    values.remove(key);
  }

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }
}
