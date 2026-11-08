// File note: This file handles nearby_notification_service.dart.
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:url_launcher/url_launcher.dart';

class NearbyNotificationService {
  NearbyNotificationService({FlutterLocalNotificationsPlugin? plugin})
    : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;
  bool _initialized = false;

  Future<bool> requestPermission() async {
    if (kIsWeb) {
      if (!_initialized) {
        final initialized = await _plugin.initialize(
          settings: const InitializationSettings(
            web: WebInitializationSettings(),
          ),
          onDidReceiveNotificationResponse: _handleNotificationResponse,
        );
        _initialized = initialized ?? false;
      }
      if (!_initialized || !WebFlutterLocalNotificationsPlugin.isSupported) {
        return false;
      }
      final granted = await _plugin
          .resolvePlatformSpecificImplementation<
            WebFlutterLocalNotificationsPlugin
          >()
          ?.requestNotificationsPermission();
      return granted ?? false;
    }
    if (defaultTargetPlatform != TargetPlatform.android &&
        defaultTargetPlatform != TargetPlatform.iOS) {
      return false;
    }
    if (!_initialized) {
      await _plugin.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestBadgePermission: false,
            requestSoundPermission: false,
          ),
        ),
        onDidReceiveNotificationResponse: _handleNotificationResponse,
      );
      _initialized = true;
    }

    if (defaultTargetPlatform == TargetPlatform.android) {
      final granted = await _plugin
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >()
          ?.requestNotificationsPermission();
      return granted ?? true;
    }
    final granted = await _plugin
        .resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin
        >()
        ?.requestPermissions(alert: true, badge: false, sound: true);
    return granted ?? false;
  }

  Future<void> showIncident({
    required int incidentId,
    required String category,
    required int distanceMeters,
    required String incidentDate,
    required String sourceName,
    required String? sourceUrl,
  }) async {
    if (!_initialized) {
      throw StateError('Notification permission has not been requested.');
    }
    await _plugin.show(
      id: incidentId,
      title: 'Verified incident nearby',
      body:
          '$category · $distanceMeters m · $incidentDate · Source: $sourceName',
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'nearby_verified_incidents',
          'Nearby verified incidents',
          channelDescription:
              'Alerts for verified incidents near your current location.',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
        web: WebNotificationDetails(),
      ),
      payload: sourceUrl,
    );
  }

  Future<void> _handleNotificationResponse(
    NotificationResponse response,
  ) async {
    final source = response.payload;
    if (source == null || source.isEmpty) return;
    final uri = Uri.tryParse(source);
    if (uri == null ||
        (uri.scheme != 'https' && uri.scheme != 'http') ||
        !await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      debugPrint('Unable to open the incident source link.');
    }
  }
}
