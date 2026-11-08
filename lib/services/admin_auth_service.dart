// File note: This file handles admin_auth_service.dart.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../core/api_config.dart';

abstract interface class AdminSessionStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class _SecureAdminSessionStore implements AdminSessionStore {
  const _SecureAdminSessionStore(this._storage);

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

class AdminSession {
  const AdminSession({
    required this.id,
    required this.email,
    required this.role,
    required this.expiresAt,
  });

  final String id;
  final String email;
  final String role;
  final DateTime expiresAt;
}

class AdminDashboardSummary {
  const AdminDashboardSummary({
    required this.totalVerifiedIncidents,
    required this.incidentsAddedRecently,
    required this.statisticsLabel,
  });

  factory AdminDashboardSummary.fromJson(Map<String, dynamic> json) {
    final total = json['totalVerifiedIncidents'];
    final recent = json['incidentsAddedRecently'];
    final label = json['statisticsLabel'];
    if (total is! num || recent is! num || label is! String) {
      throw const FormatException('Invalid admin dashboard response.');
    }
    return AdminDashboardSummary(
      totalVerifiedIncidents: total.toInt(),
      incidentsAddedRecently: recent.toInt(),
      statisticsLabel: label,
    );
  }

  final int totalVerifiedIncidents;
  final int incidentsAddedRecently;
  final String statisticsLabel;
}

class AdminAuthService {
  AdminAuthService({
    http.Client? client,
    AdminSessionStore? storage,
    Uri? baseUri,
  }) : _client = client ?? http.Client(),
       _storage =
           storage ?? _SecureAdminSessionStore(const FlutterSecureStorage()),
       _baseUri = baseUri ?? ApiConfig.baseUri;

  static final AdminAuthService instance = AdminAuthService();

  static const _tokenKey = 'admin.jwt';
  static const _expiresAtKey = 'admin.expiresAt';
  static const _userIdKey = 'admin.userId';
  static const _emailKey = 'admin.email';
  static const _roleKey = 'admin.role';
  static const _keys = [
    _tokenKey,
    _expiresAtKey,
    _userIdKey,
    _emailKey,
    _roleKey,
  ];

  final http.Client _client;
  final AdminSessionStore _storage;
  final Uri _baseUri;

  Future<AdminSession?> restoreSession() async {
    final token = await _storage.read(_tokenKey);
    if (token == null || token.isEmpty) return null;

    final expiresAtValue = await _storage.read(_expiresAtKey);
    final id = await _storage.read(_userIdKey);
    final email = await _storage.read(_emailKey);
    final role = await _storage.read(_roleKey);
    final expiresAt = expiresAtValue == null
        ? null
        : DateTime.tryParse(expiresAtValue);

    if (expiresAt == null ||
        !expiresAt.isAfter(DateTime.now()) ||
        id == null ||
        id.isEmpty ||
        email == null ||
        email.isEmpty ||
        role != 'ADMIN') {
      await clearSession();
      return null;
    }

    return AdminSession(
      id: id,
      email: email,
      role: role!,
      expiresAt: expiresAt,
    );
  }

  Future<AdminSession> login({
    required String email,
    required String password,
  }) async {
    if (email.trim().isEmpty || password.isEmpty) {
      throw const AdminAuthException('Enter your email and password.');
    }

    final response = await _send(
      () => _client
          .post(
            _baseUri.resolve('/api/auth/login'),
            headers: const {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: jsonEncode({'email': email.trim(), 'password': password}),
          )
          .timeout(const Duration(seconds: 10)),
    );
    final decoded = _decode(response);
    if (response.statusCode != 200) {
      throw _failureForStatus(response.statusCode, isLogin: true);
    }
    if (decoded is! Map<String, dynamic> || decoded['success'] != true) {
      throw const AdminAuthException(
        'The server returned an invalid login response.',
      );
    }
    final data = decoded['data'];
    if (data is! Map<String, dynamic>) {
      throw const AdminAuthException(
        'The server returned an invalid login response.',
      );
    }
    final token = data['token'];
    final expiresInSeconds = data['expiresInSeconds'];
    final user = data['user'];
    if (token is! String ||
        token.isEmpty ||
        expiresInSeconds is! int ||
        expiresInSeconds <= 0 ||
        user is! Map<String, dynamic>) {
      throw const AdminAuthException(
        'The server returned an invalid login response.',
      );
    }

    final id = user['id'];
    final returnedEmail = user['email'];
    final role = user['role'];
    if (id is! String ||
        id.isEmpty ||
        returnedEmail is! String ||
        returnedEmail.isEmpty ||
        role is! String) {
      throw const AdminAuthException(
        'The server returned invalid account information.',
      );
    }
    if (role != 'ADMIN') {
      throw const AdminAuthException(
        'This account does not have administrator access.',
      );
    }

    final expiresAt = DateTime.now().add(Duration(seconds: expiresInSeconds));
    await _storage.write(_tokenKey, token);
    await _storage.write(_expiresAtKey, expiresAt.toIso8601String());
    await _storage.write(_userIdKey, id);
    await _storage.write(_emailKey, returnedEmail);
    await _storage.write(_roleKey, role);

    return AdminSession(
      id: id,
      email: returnedEmail,
      role: role,
      expiresAt: expiresAt,
    );
  }

  Future<AdminDashboardSummary> fetchDashboard() async {
    final session = await restoreSession();
    if (session == null) {
      throw const AdminAuthException(
        'Your admin session has expired. Please sign in again.',
        sessionInvalid: true,
      );
    }
    final token = await _storage.read(_tokenKey);
    if (token == null || token.isEmpty) {
      await clearSession();
      throw const AdminAuthException(
        'Your admin session has expired. Please sign in again.',
        sessionInvalid: true,
      );
    }

    final response = await _send(
      () => _client
          .get(
            _baseUri.resolve('/api/admin/dashboard'),
            headers: {
              'Accept': 'application/json',
              'Authorization': 'Bearer $token',
            },
          )
          .timeout(const Duration(seconds: 10)),
    );
    if (response.statusCode == 401 || response.statusCode == 403) {
      await clearSession();
      throw _failureForStatus(response.statusCode);
    }
    final decoded = _decode(response);
    if (response.statusCode != 200) {
      throw _failureForStatus(response.statusCode);
    }
    if (decoded is! Map<String, dynamic> ||
        decoded['success'] != true ||
        decoded['data'] is! Map<String, dynamic>) {
      throw const AdminAuthException(
        'The server returned an invalid dashboard response.',
      );
    }
    try {
      return AdminDashboardSummary.fromJson(
        decoded['data'] as Map<String, dynamic>,
      );
    } on FormatException {
      throw const AdminAuthException(
        'The server returned an invalid dashboard response.',
      );
    }
  }

  Future<void> clearSession() async {
    for (final key in _keys) {
      await _storage.delete(key);
    }
  }

  Future<http.Response> _send(Future<http.Response> Function() request) async {
    try {
      return await request();
    } on TimeoutException {
      throw const AdminAuthException(
        'The server took too long to respond. Please try again.',
      );
    } on SocketException {
      throw const AdminAuthException(
        'Cannot connect to Urban Danger. Check the backend address and try again.',
      );
    } on http.ClientException {
      throw const AdminAuthException(
        'Cannot reach the server. Check your connection and try again.',
      );
    }
  }

  dynamic _decode(http.Response response) {
    try {
      return jsonDecode(response.body);
    } on FormatException {
      throw const AdminAuthException(
        'The server returned an invalid response. Please try again later.',
      );
    }
  }

  AdminAuthException _failureForStatus(int statusCode, {bool isLogin = false}) {
    return switch (statusCode) {
      401 when isLogin => const AdminAuthException(
        'Invalid email or password.',
      ),
      401 => const AdminAuthException(
        'Your admin session has expired. Please sign in again.',
        sessionInvalid: true,
      ),
      403 => const AdminAuthException(
        'This account does not have administrator access.',
        sessionInvalid: true,
      ),
      429 => const AdminAuthException(
        'Too many login attempts. Try again later.',
      ),
      >= 500 => const AdminAuthException(
        'The admin service is temporarily unavailable. Please try again later.',
      ),
      _ => const AdminAuthException(
        'Login could not be completed. Please try again.',
      ),
    };
  }
}

class AdminAuthException implements Exception {
  const AdminAuthException(this.message, {this.sessionInvalid = false});

  final String message;
  final bool sessionInvalid;
}
